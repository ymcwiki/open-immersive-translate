import { advancedPageRuleDefaults } from "../../background/rules/defaults";
import type {
  AdvancedPageConfig,
  AdvancedPageRule,
  AdvancedParagraph,
  PageTranslationState,
} from "../../shared/j-types";
import {
  connectTranslatePort,
  type ContentTranslatePort,
  type ParagraphTranslationResult,
  type TranslatePortMessage,
  type TranslateResultMessage,
} from "../../shared/messages";
import { normalizeLang } from "../../shared/lang";
import type {
  Config,
  Paragraph,
  Rule,
  TranslationMode,
  TranslationPriority,
} from "../../shared/types";
import { detectPageLanguage, detectTextLanguage, isParagraphTargetLanguage } from "../extract/language";
import { findMainContent } from "../extract/main-area";
import { joinPreLikeTranslation, splitPreLikeText } from "../extract/pre-like";
import { extractParagraphs, extractTitle } from "../extract/scanner";
import { observeMutations } from "../observe/mutation";
import { translateImmediately } from "../observe/immediate";
import { observeViewport, type ViewportObserver } from "../observe/viewport";
import { decodePlaceholders } from "../extract/placeholder";
import {
  injectStyles,
  markTranslated,
  removeAll as removeRenderedTranslations,
  renderTranslation,
  setError,
  setLoading,
  setMask as setRenderedMask,
  setMode as setRenderedMode,
} from "../render/inject";
import { controllerT } from "./i18n";
import { installEditableTranslations, TranslationOverrideStore } from "./editable";
import { installDirectHoverTranslation } from "./hover-directly";
import { buildPageContext } from "./page-context";
import {
  glossaryForDomain,
  resolveTranslationMode,
  resolveTranslationTheme,
  shouldAutoTranslatePage,
} from "./patterns";
import { pageTranslationState } from "./page-state";
import type { PageControllerActions } from "./commands";

const PLACEHOLDER_STYLE = { open: "{", close: "}" } as const;
const RECONNECT_DELAY_MS = 250;

interface PendingRequest {
  message: TranslatePortMessage;
  remaining: Set<string>;
  resolve(): void;
}

interface TextWaiter {
  resolve(text: string): void;
  reject(error: Error): void;
}

export interface TranslationControllerOptions {
  reportState?(state: PageTranslationState): void;
}

/** Owns page extraction, scheduling, rendering, runtime modes, and state. */
export class TranslationController implements PageControllerActions {
  config: AdvancedPageConfig;
  rule: AdvancedPageRule;

  private active = false;
  private scope: "main" | "whole";
  private immediate: boolean;
  private mask: boolean;
  private hoverDirectly: boolean;
  private videoSubtitlePreTranslation: boolean;
  private runtimeService?: string;
  private runtimeMode?: TranslationMode;
  private destroyed = false;
  private sequence = 0;
  private generation = 0;
  private pageLanguage = detectPageLanguage(document);
  private port?: ContentTranslatePort;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private viewport?: ViewportObserver;
  private stopMutation?: () => void;
  private stopEditing?: () => void;
  private stopDirectHover?: () => void;
  private readonly paragraphs = new Map<string, AdvancedParagraph>();
  private readonly pendingIds = new Set<string>();
  private readonly renderedIds = new Set<string>();
  private readonly errorIds = new Set<string>();
  private readonly requests = new Map<string, PendingRequest>();
  private readonly textWaiters = new Map<string, TextWaiter>();
  private overrideStore = new TranslationOverrideStore(window.location.hostname);
  private readonly reportState?: (state: PageTranslationState) => void;

  constructor(config: Config, rule: Rule, options: TranslationControllerOptions = {}) {
    this.config = config as AdvancedPageConfig;
    this.rule = { ...advancedPageRuleDefaults, ...rule } as AdvancedPageRule;
    this.scope = this.config.translateMainOnly === false ? "whole" : "main";
    this.immediate = this.config.translateToPageEndImmediately === true;
    this.mask = this.config.translationMask === true;
    this.hoverDirectly = this.config.hoverTranslateDirectly === true;
    this.videoSubtitlePreTranslation = this.config.videoSubtitlePreTranslation === true;
    this.reportState = options.reportState;
    this.injectPageStyles();
    setRenderedMask(document, this.mask);
    this.connect();
    this.installMutationObserver();
    this.installEditing();
    this.installDirectHover();
    this.emitState();
  }

  isTranslated(): boolean {
    return this.active;
  }

  shouldAutoTranslate(): boolean {
    return shouldAutoTranslatePage(
      this.config,
      this.rule,
      window.location.hostname,
      this.pageLanguage,
    );
  }

  toggleTranslate(scope: "main" | "whole" = this.scope): void {
    if (this.active) this.removeAll();
    else this.start(scope);
  }

  togglePage(): void {
    this.toggleTranslate(this.scope);
  }

  toggleWholePage(): void {
    this.toggleTranslate("whole");
  }

  toggleMainPage(): void {
    this.toggleTranslate("main");
  }

  start(scope: "main" | "whole" = this.scope): void {
    if (this.active || this.destroyed) return;
    this.active = true;
    this.scope = scope;
    this.injectPageStyles();
    if (!this.immediate) {
      this.viewport = observeViewport([], (ids) => {
        void this.translateParagraphIds(ids, "viewport");
      });
    }
    void this.rescan();
  }

  setMode(mode: TranslationMode): void {
    this.runtimeMode = mode;
    this.config = { ...this.config, translationMode: mode };
    setRenderedMode(document, mode);
  }

  toggleOnlyTranslation(): void {
    const current = this.currentMode();
    this.setMode(current === "translation" ? "dual" : "translation");
  }

  togglePageEndImmediately(): void {
    if (this.active && this.immediate) {
      this.removeAll();
      return;
    }
    this.immediate = true;
    this.viewport?.disconnect();
    this.viewport = undefined;
    if (!this.active) this.start(this.scope);
    else void this.translateAllPending();
  }

  toggleMask(): void {
    this.mask = !this.mask;
    setRenderedMask(document, this.mask);
  }

  toggleHoverDirectly(): void {
    this.hoverDirectly = !this.hoverDirectly;
    this.installDirectHover();
  }

  toggleVideoSubtitlePreTranslation(): void {
    this.videoSubtitlePreTranslation = !this.videoSubtitlePreTranslation;
    document.dispatchEvent(
      new CustomEvent("imt:video-subtitle-pretranslation", {
        detail: { enabled: this.videoSubtitlePreTranslation },
      }),
    );
  }

  translateWithService(serviceId: string): void {
    const scope = this.scope;
    this.removeAll();
    this.runtimeService = serviceId;
    this.start(scope);
  }

  update(config: Config, rule: Rule): void {
    const wasActive = this.active;
    const scope = this.scope;
    this.removeAll();
    this.config = config as AdvancedPageConfig;
    this.rule = { ...advancedPageRuleDefaults, ...rule } as AdvancedPageRule;
    this.overrideStore = new TranslationOverrideStore(window.location.hostname);
    this.pageLanguage = detectPageLanguage(document);
    this.immediate = this.config.translateToPageEndImmediately === true;
    this.mask = this.config.translationMask === true;
    this.hoverDirectly = this.config.hoverTranslateDirectly === true;
    this.videoSubtitlePreTranslation = this.config.videoSubtitlePreTranslation === true;
    this.runtimeMode = undefined;
    this.runtimeService = undefined;
    this.injectPageStyles();
    setRenderedMask(document, this.mask);
    this.installMutationObserver();
    this.installEditing();
    this.installDirectHover();
    if (wasActive) this.start(scope);
  }

  async translateParagraph(container: Element): Promise<void> {
    const paragraph = extractParagraphs(container, this.extractionRule()).find(
      (candidate) => candidate.container === container,
    ) as AdvancedParagraph | undefined;
    if (!paragraph || !this.registerParagraph(paragraph)) return;
    const override = await this.overrideStore.get(paragraph.id);
    if (!this.paragraphs.has(paragraph.id)) return;
    if (override !== undefined) {
      this.renderText(paragraph, override, false);
      return;
    }
    await this.translateParagraphIds([paragraph.id], "interactive");
  }

  translateText(text: string, from: string, to: string): Promise<string> {
    return this.requestText(text, from, to, "interactive");
  }

  translateActiveInput(): void {
    const field = document.activeElement;
    if (!(
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      (field instanceof HTMLElement && field.isContentEditable)
    )) return;
    const text = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? field.value
      : (field.textContent ?? "");
    if (!text.trim()) return;
    void this.translateText(
      text,
      this.config.sourceLanguage,
      this.config.input.targetLanguage ?? this.config.targetLanguage,
    )
      .then((translation) => {
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
          field.value = translation;
        } else {
          field.textContent = translation;
        }
        field.dispatchEvent(new InputEvent("input", { bubbles: true }));
      })
      .catch(() => undefined);
  }

  removeAll(): void {
    this.active = false;
    this.generation += 1;
    this.viewport?.disconnect();
    this.viewport = undefined;
    for (const [requestId, request] of this.requests) {
      this.post({ type: "cancel", requestId });
      request.resolve();
      for (const id of request.remaining) {
        this.textWaiters.get(id)?.reject(new Error("Translation cancelled."));
        this.textWaiters.delete(id);
      }
    }
    this.requests.clear();
    this.pendingIds.clear();
    this.renderedIds.clear();
    this.errorIds.clear();
    this.paragraphs.clear();
    removeRenderedTranslations(document);
    this.injectPageStyles();
    setRenderedMask(document, this.mask);
    this.emitState();
  }

  destroy(): void {
    this.destroyed = true;
    this.removeAll();
    this.stopMutation?.();
    this.stopEditing?.();
    this.stopDirectHover?.();
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.port?.disconnect();
    this.port = undefined;
  }

  state(): PageTranslationState {
    return pageTranslationState({
      active: this.active,
      total: this.paragraphs.size,
      pending: this.pendingIds.size,
      translated: this.renderedIds.size,
      errors: this.errorIds.size,
    });
  }

  private extractionRule(): AdvancedPageRule {
    return this.scope === "whole" ? { ...this.rule, selectors: [] } : this.rule;
  }

  private currentMode(): TranslationMode {
    return (
      this.runtimeMode ??
      resolveTranslationMode(
        this.config,
        this.rule,
        window.location.href,
        this.pageLanguage,
      )
    );
  }

  private currentTheme(): string {
    return resolveTranslationTheme(this.config, this.rule, window.location.href);
  }

  private injectPageStyles(): void {
    injectStyles(document, [
      this.config.globalCustomCss ?? "",
      ...(this.rule.injectedCss ?? []),
    ].filter(Boolean));
  }

  private installMutationObserver(): void {
    this.stopMutation?.();
    if (!document.body) return;
    this.stopMutation = observeMutations(
      document.body,
      () => {
        if (this.active) void this.rescan();
      },
      { excludeSelectors: this.rule.mutationExcludeSelectors },
    );
  }

  private installEditing(): void {
    this.stopEditing?.();
    this.stopEditing = installEditableTranslations(document, {
      enabled: this.config.enableEditTranslation === true,
      save: (id, translation) => this.overrideStore.set(id, translation),
    });
  }

  private installDirectHover(): void {
    this.stopDirectHover?.();
    this.stopDirectHover = undefined;
    if (!this.hoverDirectly) return;
    this.stopDirectHover = installDirectHoverTranslation(
      (container) => this.translateParagraph(container),
      this.rule.allBlockTags ?? [],
    );
  }

  private scanRoot(): Node {
    if (this.scope === "whole" || this.rule.selectors?.length) return document.body;
    return findMainContent(document) ?? document.body;
  }

  private async rescan(): Promise<void> {
    if (!this.active || !document.body) return;
    const found = extractParagraphs(this.scanRoot(), this.extractionRule()) as AdvancedParagraph[];
    const title = extractTitle(document, this.extractionRule());
    if (title) found.unshift(title as AdvancedParagraph);
    const queued: string[] = [];
    for (const paragraph of found) {
      if (!this.registerParagraph(paragraph)) continue;
      const override = await this.overrideStore.get(paragraph.id);
      if (!this.active) return;
      if (override !== undefined) this.renderText(paragraph, override, false);
      else queued.push(paragraph.id);
    }
    if (this.immediate) {
      await this.translateIdsImmediately(queued);
    } else {
      for (const id of queued) {
        const paragraph = this.paragraphs.get(id);
        if (paragraph) this.viewport?.add([id, paragraph.container]);
      }
    }
    this.emitState();
  }

  private registerParagraph(paragraph: AdvancedParagraph): boolean {
    if (
      this.paragraphs.has(paragraph.id) ||
      this.pendingIds.has(paragraph.id) ||
      this.renderedIds.has(paragraph.id)
    ) return false;
    const detected = detectTextLanguage(paragraph.text);
    paragraph.lang = detected;
    if (
      this.rule.sameLangCheck !== false &&
      isParagraphTargetLanguage(paragraph.text, this.config.targetLanguage)
    ) return false;
    this.paragraphs.set(paragraph.id, paragraph);
    return true;
  }

  private async translateAllPending(): Promise<void> {
    const ids = [...this.paragraphs.keys()].filter(
      (id) => !this.pendingIds.has(id) && !this.renderedIds.has(id),
    );
    await this.translateIdsImmediately(ids);
  }

  private translateIdsImmediately(ids: readonly string[]): Promise<void> {
    return translateImmediately(
      ids,
      (id) => this.translateParagraphIds([id], "normal"),
      { concurrency: this.config.immediateTranslationConcurrency ?? 4 },
    );
  }

  private async translateParagraphIds(
    ids: readonly string[],
    priority: TranslationPriority,
  ): Promise<void> {
    const paragraphs = ids.flatMap((id) => {
      const paragraph = this.paragraphs.get(id);
      return paragraph && !this.pendingIds.has(id) && !this.renderedIds.has(id)
        ? [paragraph]
        : [];
    });
    if (!paragraphs.length) return;
    const preformatted = paragraphs.filter((paragraph) => paragraph.preformatted);
    const regular = paragraphs.filter((paragraph) => !paragraph.preformatted);
    await Promise.all([
      regular.length ? this.requestParagraphs(regular, priority) : Promise.resolve(),
      ...preformatted.map((paragraph) => this.translatePreformatted(paragraph, priority)),
    ]);
  }

  private requestParagraphs(
    paragraphs: readonly AdvancedParagraph[],
    priority: TranslationPriority,
  ): Promise<void> {
    for (const paragraph of paragraphs) {
      this.pendingIds.add(paragraph.id);
      this.errorIds.delete(paragraph.id);
      setLoading(paragraph);
    }
    const requestId = this.newRequestId();
    const message: TranslatePortMessage = {
      type: "translate",
      requestId,
      paragraphs: paragraphs.map(({ id, text }) => ({ id, text, priority })),
      from: this.config.sourceLanguage,
      to: this.config.targetLanguage,
      service: this.runtimeService ?? this.rule.service ?? this.config.service,
      glossary: this.glossary(),
      context: this.context(),
      priority,
    };
    this.emitState();
    return new Promise((resolve) => {
      this.requests.set(requestId, {
        message,
        remaining: new Set(paragraphs.map(({ id }) => id)),
        resolve,
      });
      this.post(message);
    });
  }

  private async translatePreformatted(
    paragraph: AdvancedParagraph,
    priority: TranslationPriority,
  ): Promise<void> {
    const generation = this.generation;
    this.pendingIds.add(paragraph.id);
    this.errorIds.delete(paragraph.id);
    setLoading(paragraph);
    this.emitState();
    try {
      const lines = splitPreLikeText(paragraph.text);
      const sources = lines.filter((line) => line.text).map((line) => line.text);
      const translations = new Array<string>(sources.length);
      await translateImmediately(
        sources.map((source, index) => ({ source, index })),
        async ({ source, index }) => {
          translations[index] = await this.requestText(
            source,
            this.config.sourceLanguage,
            this.config.targetLanguage,
            priority,
          );
        },
        { concurrency: this.config.immediateTranslationConcurrency ?? 4 },
      );
      if (generation !== this.generation) return;
      this.renderText(paragraph, joinPreLikeTranslation(lines, translations), false);
    } catch {
      if (generation !== this.generation) return;
      this.pendingIds.delete(paragraph.id);
      this.errorIds.add(paragraph.id);
      setError(paragraph, controllerT("translationFailed"), () => {
        void this.translateParagraphIds([paragraph.id], "interactive");
      });
      this.emitState();
    }
  }

  private requestText(
    text: string,
    from: string,
    to: string,
    priority: TranslationPriority,
  ): Promise<string> {
    const id = `text-${Date.now().toString(36)}-${++this.sequence}`;
    const requestId = this.newRequestId();
    const message: TranslatePortMessage = {
      type: "translate",
      requestId,
      paragraphs: [{ id, text, priority }],
      from: normalizeLang(from),
      to: normalizeLang(to),
      service: this.runtimeService ?? this.rule.service ?? this.config.service,
      glossary: this.glossary(),
      context: this.context(),
      priority,
    };
    return new Promise<string>((resolve, reject) => {
      this.textWaiters.set(id, { resolve, reject });
      this.requests.set(requestId, {
        message,
        remaining: new Set([id]),
        resolve: () => undefined,
      });
      this.post(message);
    });
  }

  private glossary(): Array<{ k: string; v: string }> {
    return glossaryForDomain(
      [...this.config.glossaries, ...(this.rule.glossaries ?? [])],
      window.location.hostname,
    ).map(({ k, v }) => ({ k, v }));
  }

  private context() {
    return buildPageContext(
      document,
      [...this.paragraphs.values()].map((paragraph) => paragraph.text),
      this.config.contextWordLimit ?? 80,
    );
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
        if (paragraphs.length) port.postMessage({ ...request.message, paragraphs });
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

  private post(message: Parameters<ContentTranslatePort["postMessage"]>[0]): void {
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
      } else {
        this.renderResult(result);
      }
    }
    if (!request.remaining.size) {
      this.requests.delete(message.requestId);
      request.resolve();
      return;
    }
    if (!message.done) return;
    for (const id of request.remaining) {
      this.pendingIds.delete(id);
      const waiter = this.textWaiters.get(id);
      if (waiter) {
        waiter.reject(new Error("Translation ended without a result."));
        this.textWaiters.delete(id);
      } else {
        const paragraph = this.paragraphs.get(id);
        if (paragraph) {
          this.errorIds.add(id);
          setError(paragraph, controllerT("translationFailed"), () => {
            void this.translateParagraphIds([id], "interactive");
          });
        }
      }
    }
    this.requests.delete(message.requestId);
    request.resolve();
    this.emitState();
  }

  private renderResult(result: ParagraphTranslationResult): void {
    this.pendingIds.delete(result.id);
    const paragraph = this.paragraphs.get(result.id);
    if (!paragraph) return;
    if (result.error) {
      this.errorIds.add(result.id);
      setError(paragraph, controllerT("translationFailed"), () => {
        void this.translateParagraphIds([result.id], "interactive");
      });
      this.emitState();
      return;
    }
    this.renderText(paragraph, result.text ?? "", true);
  }

  private renderText(
    paragraph: AdvancedParagraph,
    text: string,
    decode: boolean,
  ): void {
    try {
      const fragment = decode
        ? decodePlaceholders(text, paragraph.placeholders, PLACEHOLDER_STYLE)
        : document.createDocumentFragment();
      if (!decode) fragment.append(text);
      renderTranslation(paragraph as Paragraph, fragment, {
        mode: this.currentMode(),
        theme: this.currentTheme(),
        wrapperTag: "font",
        prefix:
          this.rule.wrapperPrefix === "block" || this.rule.wrapperPrefix === "inline"
            ? this.rule.wrapperPrefix
            : "smart",
        preformatted: paragraph.preformatted,
        style: {
          font: this.config.font,
          fontSize:
            typeof this.config.translationFontSize === "number"
              ? `${this.config.translationFontSize}px`
              : this.config.translationFontSize,
          color: this.config.translationColor,
          lineHeight: this.config.translationLineHeight,
        },
      });
      markTranslated(paragraph.container, paragraph.id);
      this.pendingIds.delete(paragraph.id);
      this.errorIds.delete(paragraph.id);
      this.renderedIds.add(paragraph.id);
    } catch {
      this.pendingIds.delete(paragraph.id);
      this.errorIds.add(paragraph.id);
      setError(paragraph, controllerT("invalidTranslation"), () => {
        void this.translateParagraphIds([paragraph.id], "interactive");
      });
    }
    this.emitState();
  }

  private emitState(): void {
    this.reportState?.(this.state());
  }
}
