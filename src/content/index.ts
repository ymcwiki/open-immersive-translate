import browser from "webextension-polyfill";

import {
  connectTranslatePort,
  sendToBackground,
  type ContentTranslatePort,
  type Msg,
  type ParagraphTranslationResult,
  type TranslatePortMessage,
  type TranslateResultMessage,
} from "../shared/messages";
import { detectLang, isSameLang, normalizeLang } from "../shared/lang";
import type {
  Config,
  Paragraph,
  Rule,
  TranslationMode,
  TranslationPriority,
} from "../shared/types";
import { extractParagraphs } from "./extract/scanner";
import { decodePlaceholders } from "./extract/placeholder";
import type { FeatureContext } from "./features/context";
import { init as initFloatBall } from "./features/float-ball";
import { init as initHoverTranslation } from "./features/hover-translate";
import { init as initInputTranslation } from "./features/input-translate";
import { init as initSelectionTranslation } from "./features/selection-translate";
import { init as initYouTubeSubtitles } from "./features/youtube-subtitle";
import { observeMutations } from "./observe/mutation";
import { onUrlChange } from "./observe/url-change";
import { observeViewport, type ViewportObserver } from "./observe/viewport";
import {
  injectStyles,
  markTranslated,
  removeAll as removeRenderedTranslations,
  renderTranslation,
  setError,
  setLoading,
  setMode as setRenderedMode,
} from "./render/inject";

const PLACEHOLDER_STYLE = { open: "{", close: "}" } as const;
const RECONNECT_DELAY_MS = 250;

interface PendingRequest {
  message: TranslatePortMessage;
  remaining: Set<string>;
}

interface TextWaiter {
  resolve(text: string): void;
  reject(error: Error): void;
}

/** Read-only content state exposed for extension debugging. */
export interface ImtDebugState {
  readonly version: "phase2";
  ready: boolean;
  active: boolean;
  config?: Config;
  rule?: Rule;
  error?: unknown;
}

declare global {
  interface Window {
    __imt: ImtDebugState;
  }
}

export class TranslationController {
  config: Config;
  rule: Rule;

  private active = false;
  private scope: "main" | "whole" = "main";
  private destroyed = false;
  private sequence = 0;
  private port?: ContentTranslatePort;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private viewport?: ViewportObserver;
  private stopMutation?: () => void;
  private readonly paragraphs = new Map<string, Paragraph>();
  private readonly pendingIds = new Set<string>();
  private readonly renderedIds = new Set<string>();
  private readonly requests = new Map<string, PendingRequest>();
  private readonly textWaiters = new Map<string, TextWaiter>();

  constructor(config: Config, rule: Rule) {
    this.config = config;
    this.rule = rule;
    injectStyles(document, rule.injectedCss);
    this.connect();
    this.installMutationObserver();
  }

  isTranslated(): boolean {
    return this.active;
  }

  shouldAutoTranslate(): boolean {
    const hostname = window.location.hostname;
    if (this.config.neverTranslateSites.includes(hostname)) return false;
    return (
      this.config.alwaysTranslateSites.includes(hostname) ||
      this.rule.autoTranslate === true
    );
  }

  toggleTranslate(scope: "main" | "whole" = "main"): void {
    if (this.active) {
      this.removeAll();
      return;
    }
    this.start(scope);
  }

  start(scope: "main" | "whole" = "main"): void {
    if (this.active || this.destroyed) return;
    this.active = true;
    this.scope = scope;
    injectStyles(document, this.rule.injectedCss);
    this.viewport = observeViewport([], (ids) => {
      this.translateParagraphIds(ids, "viewport");
    });
    this.rescan();
    this.updateDebugState();
  }

  setMode(mode: TranslationMode): void {
    this.config = { ...this.config, translationMode: mode };
    setRenderedMode(document, mode);
    this.updateDebugState();
  }

  removeAll(): void {
    this.active = false;
    this.viewport?.disconnect();
    this.viewport = undefined;
    for (const [requestId, request] of this.requests) {
      this.post({ type: "cancel", requestId });
      for (const id of request.remaining) {
        this.textWaiters.get(id)?.reject(new Error("Translation cancelled."));
        this.textWaiters.delete(id);
      }
    }
    this.requests.clear();
    this.pendingIds.clear();
    this.renderedIds.clear();
    this.paragraphs.clear();
    removeRenderedTranslations(document);
    this.updateDebugState();
  }

  update(config: Config, rule: Rule): void {
    const wasActive = this.active;
    const scope = this.scope;
    this.removeAll();
    this.config = config;
    this.rule = rule;
    injectStyles(document, rule.injectedCss);
    this.installMutationObserver();
    if (wasActive) this.start(scope);
    this.updateDebugState();
  }

  translateParagraph(container: Element): Promise<void> {
    const paragraph = extractParagraphs(container, this.extractionRule()).find(
      (candidate) => candidate.container === container,
    );
    if (!paragraph || !this.registerParagraph(paragraph)) {
      return Promise.resolve();
    }
    this.translateParagraphIds([paragraph.id], "interactive");
    return Promise.resolve();
  }

  translateText(text: string, from: string, to: string): Promise<string> {
    const id = `text-${Date.now().toString(36)}-${++this.sequence}`;
    const requestId = this.newRequestId();
    const message: TranslatePortMessage = {
      type: "translate",
      requestId,
      paragraphs: [{ id, text, priority: "interactive" }],
      from: normalizeLang(from),
      to: normalizeLang(to),
      service: this.rule.service ?? this.config.service,
      glossary: this.glossary(),
      context: { title: document.title },
    };

    return new Promise<string>((resolve, reject) => {
      this.textWaiters.set(id, { resolve, reject });
      this.requests.set(requestId, { message, remaining: new Set([id]) });
      this.post(message);
    });
  }

  translateActiveInput(): void {
    const field = document.activeElement;
    if (!(
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      (field instanceof HTMLElement && field.isContentEditable)
    )) {
      return;
    }

    const text =
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? field.value
        : (field.textContent ?? "");
    if (!text.trim()) return;

    void this.translateText(
      text,
      this.config.sourceLanguage,
      this.config.input.targetLanguage ?? this.config.targetLanguage,
    ).then((translation) => {
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      ) {
        field.value = translation;
      } else {
        field.textContent = translation;
      }
      field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.removeAll();
    this.stopMutation?.();
    this.stopMutation = undefined;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.port?.disconnect();
    this.port = undefined;
  }

  private extractionRule(): Rule {
    return this.scope === "whole" ? { ...this.rule, selectors: [] } : this.rule;
  }

  private installMutationObserver(): void {
    this.stopMutation?.();
    if (!document.body) return;
    this.stopMutation = observeMutations(
      document.body,
      () => {
        if (this.active) this.rescan();
      },
      { excludeSelectors: this.rule.mutationExcludeSelectors },
    );
  }

  private rescan(): void {
    if (!this.active || !document.body) return;
    for (const paragraph of extractParagraphs(
      document.body,
      this.extractionRule(),
    )) {
      if (this.registerParagraph(paragraph)) {
        this.viewport?.add([paragraph.id, paragraph.container]);
      }
    }
  }

  private registerParagraph(paragraph: Paragraph): boolean {
    if (
      this.paragraphs.has(paragraph.id) ||
      this.pendingIds.has(paragraph.id) ||
      this.renderedIds.has(paragraph.id)
    ) {
      return false;
    }

    const detected = detectLang(paragraph.text);
    paragraph.lang = detected;
    const source = detected === "auto" ? this.config.sourceLanguage : detected;
    if (
      this.rule.sameLangCheck !== false &&
      source !== "auto" &&
      isSameLang(source, this.config.targetLanguage)
    ) {
      return false;
    }

    this.paragraphs.set(paragraph.id, paragraph);
    return true;
  }

  private translateParagraphIds(
    ids: readonly string[],
    priority: TranslationPriority,
  ): void {
    const paragraphs = ids.flatMap((id) => {
      const paragraph = this.paragraphs.get(id);
      return paragraph && !this.pendingIds.has(id) && !this.renderedIds.has(id)
        ? [paragraph]
        : [];
    });
    if (!paragraphs.length) return;

    for (const paragraph of paragraphs) {
      this.pendingIds.add(paragraph.id);
      setLoading(paragraph);
    }

    const requestId = this.newRequestId();
    const message: TranslatePortMessage = {
      type: "translate",
      requestId,
      paragraphs: paragraphs.map(({ id, text }) => ({ id, text, priority })),
      from: this.config.sourceLanguage,
      to: this.config.targetLanguage,
      service: this.rule.service ?? this.config.service,
      glossary: this.glossary(),
      context: { title: document.title },
      priority,
    };
    this.requests.set(requestId, {
      message,
      remaining: new Set(paragraphs.map(({ id }) => id)),
    });
    this.post(message);
  }

  private glossary(): Config["glossaries"] {
    return [...this.config.glossaries, ...(this.rule.glossaries ?? [])];
  }

  private newRequestId(): string {
    return `request-${Date.now().toString(36)}-${++this.sequence}`;
  }

  private connect(): void {
    if (this.destroyed || this.port) return;
    try {
      const port = connectTranslatePort();
      this.port = port;
      port.onMessage((message) => this.handleResult(message));
      port.onDisconnect(() => {
        if (this.port !== port) return;
        this.port = undefined;
        if (!this.destroyed) this.scheduleReconnect();
      });
      for (const request of this.requests.values()) {
        const paragraphs = request.message.paragraphs.filter(({ id }) =>
          request.remaining.has(id),
        );
        if (paragraphs.length) {
          port.postMessage({ ...request.message, paragraphs });
        }
      }
    } catch {
      this.port = undefined;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private post(
    message: Parameters<ContentTranslatePort["postMessage"]>[0],
  ): void {
    if (!this.port) {
      if (message.type === "translate") this.connect();
      return;
    }
    try {
      this.port.postMessage(message);
    } catch {
      this.port = undefined;
      if (message.type === "translate") this.scheduleReconnect();
    }
  }

  private handleResult(message: TranslateResultMessage): void {
    const request = this.requests.get(message.requestId);
    if (!request) return;

    for (const result of message.results) {
      request.remaining.delete(result.id);
      const waiter = this.textWaiters.get(result.id);
      if (waiter) {
        this.textWaiters.delete(result.id);
        if (result.error) waiter.reject(new Error(result.error.message));
        else waiter.resolve(result.text ?? "");
        continue;
      }
      this.renderResult(result);
    }

    if (!request.remaining.size) {
      this.requests.delete(message.requestId);
      return;
    }
    if (!message.done) return;
    for (const id of request.remaining) {
      this.pendingIds.delete(id);
      const waiter = this.textWaiters.get(id);
      if (waiter) {
        waiter.reject(new Error("Translation ended without a result."));
        this.textWaiters.delete(id);
        continue;
      }
      const paragraph = this.paragraphs.get(id);
      if (paragraph) {
        setError(paragraph, "翻译失败", () =>
          this.translateParagraphIds([id], "interactive"),
        );
      }
    }
    this.requests.delete(message.requestId);
  }

  private renderResult(result: ParagraphTranslationResult): void {
    this.pendingIds.delete(result.id);
    const paragraph = this.paragraphs.get(result.id);
    if (!paragraph) return;

    if (result.error) {
      setError(paragraph, "翻译失败", () =>
        this.translateParagraphIds([result.id], "interactive"),
      );
      return;
    }

    try {
      const fragment = decodePlaceholders(
        result.text ?? "",
        paragraph.placeholders,
        PLACEHOLDER_STYLE,
      );
      const target = renderTranslation(paragraph, fragment, {
        mode: this.rule.translationMode ?? this.config.translationMode,
        theme: this.rule.theme ?? this.config.theme,
        wrapperTag: "font",
        prefix:
          this.rule.wrapperPrefix === "block" ||
          this.rule.wrapperPrefix === "inline"
            ? this.rule.wrapperPrefix
            : "smart",
      });
      if (this.config.font) {
        target.style.setProperty("--imt-target-font", this.config.font);
      }
      markTranslated(paragraph.container, paragraph.id);
      this.renderedIds.add(paragraph.id);
    } catch {
      setError(paragraph, "译文格式错误", () =>
        this.translateParagraphIds([result.id], "interactive"),
      );
    }
  }

  private updateDebugState(): void {
    debugState.active = this.active;
    debugState.config = this.config;
    debugState.rule = this.rule;
  }
}

const debugState: ImtDebugState = {
  version: "phase2",
  ready: false,
  active: false,
};
window.__imt = debugState;

let controller: TranslationController | undefined;
let featureDisposers: Array<() => void> = [];
let refreshQueue = Promise.resolve();

function mountFeatures(current: TranslationController): void {
  for (const dispose of featureDisposers) dispose();
  const context: FeatureContext = {
    get config() {
      return current.config;
    },
    get rule() {
      return current.rule;
    },
    translateText: (text, from, to) => current.translateText(text, from, to),
    translateParagraph: (container) => current.translateParagraph(container),
    toggleTranslate: () => current.toggleTranslate(),
    isTranslated: () => current.isTranslated(),
  };
  featureDisposers = [
    initFloatBall(context),
    initHoverTranslation(context),
    initSelectionTranslation(context),
    initInputTranslation(context),
    initYouTubeSubtitles(context),
  ];
}

async function refresh(incomingConfig?: Config): Promise<void> {
  const [config, rule] = await Promise.all([
    incomingConfig ?? sendToBackground({ type: "getConfig" }),
    sendToBackground({ type: "getRule", url: window.location.href }),
  ]);
  if (!controller) {
    controller = new TranslationController(config, rule);
  } else {
    controller.update(config, rule);
  }
  mountFeatures(controller);
  if (!controller.isTranslated() && controller.shouldAutoTranslate()) {
    controller.start();
  }
  debugState.ready = true;
  debugState.error = undefined;
  debugState.config = config;
  debugState.rule = rule;
  debugState.active = controller.isTranslated();
}

function showContextMenuTranslation(text: string): void {
  document.querySelector('[data-imt="context-menu"]')?.remove();
  const host = document.createElement("aside");
  host.dataset.imt = "context-menu";
  host.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:360px;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#111;box-shadow:0 8px 24px rgb(0 0 0 / 20%);font:14px/1.5 system-ui";
  host.textContent = "正在翻译…";
  document.documentElement.append(host);
  void controller
    ?.translateText(
      text,
      controller.config.sourceLanguage,
      controller.config.targetLanguage,
    )
    .then((translation) => {
      if (host.isConnected) host.textContent = translation;
    })
    .catch(() => {
      if (host.isConnected) host.textContent = "翻译失败";
    });
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return undefined;
  }

  const incoming = message as Msg;
  if (incoming.type === "toggleTranslate") {
    controller?.toggleTranslate(incoming.scope);
  } else if (incoming.type === "translateInput") {
    controller?.translateActiveInput();
  } else if (incoming.type === "translateSelection") {
    showContextMenuTranslation(incoming.text);
  } else if (incoming.type === "configChanged") {
    refreshQueue = refreshQueue.then(() => refresh(incoming.config));
  }
  return undefined;
});

onUrlChange(() => {
  refreshQueue = refreshQueue.then(() => refresh());
});

void refresh().catch((error: unknown) => {
  debugState.error = error;
  console.error("[imt] Content initialization failed", error);
});

export {};
