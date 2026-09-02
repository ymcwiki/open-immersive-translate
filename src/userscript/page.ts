import { matchRuleInPage } from "../background/rules/match";
import { decodePlaceholders } from "../content/extract/placeholder";
import { extractParagraphs } from "../content/extract/scanner";
import {
  observeViewport,
  type ViewportObserver,
} from "../content/observe/viewport";
import {
  injectStyles,
  markTranslated,
  removeAll,
  renderTranslation,
  setError,
  setLoading,
  setMode,
} from "../content/render/inject";
import { detectLang, isSameLang, LANGUAGE_CODES } from "../shared/lang";
import type { LangCode, Paragraph, Rule } from "../shared/types";
import { t, userscriptLocale, type UserscriptLocale } from "./i18n";
import {
  GmUserscriptRuntime,
  type UserscriptConfig,
  type UserscriptRuntime,
  type UserscriptTheme,
} from "./runtime";

const PLACEHOLDER_STYLE = { open: "{", close: "}" } as const;
const SUBTITLE_OR_PDF_PATH = /\.(?:pdf|srt|vtt|ass|ssa|ttml)(?:$|[?#])/i;
const SUBTITLE_ENDPOINT = /(?:\/api\/timedtext|[/?#](?:subtitle|captions)=)/i;
const WORKER_COUNT = 4;

const TARGET_LANGUAGES = LANGUAGE_CODES.filter(
  (language): language is Exclude<LangCode, "auto"> => language !== "auto",
);

const LANGUAGE_NAMES: Record<Exclude<LangCode, "auto">, [string, string]> = {
  en: ["英语", "English"],
  "zh-CN": ["简体中文", "Chinese (Simplified)"],
  "zh-TW": ["繁体中文", "Chinese (Traditional)"],
  ja: ["日语", "Japanese"],
  ko: ["韩语", "Korean"],
  fr: ["法语", "French"],
  de: ["德语", "German"],
  es: ["西班牙语", "Spanish"],
  ru: ["俄语", "Russian"],
  pt: ["葡萄牙语", "Portuguese"],
  it: ["意大利语", "Italian"],
  ar: ["阿拉伯语", "Arabic"],
  vi: ["越南语", "Vietnamese"],
  th: ["泰语", "Thai"],
};

export function isExcludedUserscriptPage(
  url: string,
  contentType = "",
): boolean {
  return (
    SUBTITLE_OR_PDF_PATH.test(url) ||
    SUBTITLE_ENDPOINT.test(url) ||
    /(?:application\/pdf|text\/vtt|application\/ttml\+xml)/i.test(contentType)
  );
}

export class UserscriptPageController {
  private active = false;
  private config: UserscriptConfig;
  private readonly paragraphs = new Map<string, Paragraph>();
  private readonly pending = new Set<string>();
  private readonly translated = new Set<string>();
  private readonly queue: Paragraph[] = [];
  private readonly requests = new Set<AbortController>();
  private viewport?: ViewportObserver;
  private runningWorkers = 0;
  private generation = 0;

  constructor(
    private readonly runtime: UserscriptRuntime,
    config: UserscriptConfig,
    private readonly rule: Rule,
    private readonly document: Document,
  ) {
    this.config = config;
  }

  isTranslated(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  start(): void {
    if (this.active || !this.document.body) return;
    this.active = true;
    this.generation += 1;
    injectStyles(this.document, this.rule.injectedCss);
    this.viewport = observeViewport([], (ids) => this.enqueue(ids));
    this.scan();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.generation += 1;
    this.viewport?.disconnect();
    this.viewport = undefined;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    this.queue.length = 0;
    this.pending.clear();
    this.translated.clear();
    this.paragraphs.clear();
    removeAll(this.document);
  }

  updateConfig(config: UserscriptConfig): void {
    const requiresTranslation =
      config.sourceLanguage !== this.config.sourceLanguage ||
      config.targetLanguage !== this.config.targetLanguage ||
      config.theme !== this.config.theme;
    const wasActive = this.active;
    if (wasActive && requiresTranslation) this.stop();
    this.config = config;
    if (wasActive && requiresTranslation) this.start();
    else if (wasActive) setMode(this.document, config.translationMode);
  }

  destroy(): void {
    this.stop();
  }

  private scan(): void {
    if (!this.active || !this.document.body) return;
    for (const paragraph of extractParagraphs(this.document.body, this.rule)) {
      if (
        this.paragraphs.has(paragraph.id) ||
        this.pending.has(paragraph.id) ||
        this.translated.has(paragraph.id)
      ) {
        continue;
      }

      const detected = detectLang(paragraph.text);
      const source =
        detected === "auto" ? this.config.sourceLanguage : detected;
      if (
        this.rule.sameLangCheck !== false &&
        source !== "auto" &&
        isSameLang(source, this.config.targetLanguage)
      ) {
        continue;
      }

      paragraph.lang = detected;
      this.paragraphs.set(paragraph.id, paragraph);
      this.viewport?.add([paragraph.id, paragraph.container]);
    }
  }

  private enqueue(ids: readonly string[]): void {
    for (const id of ids) {
      const paragraph = this.paragraphs.get(id);
      if (!paragraph || this.pending.has(id) || this.translated.has(id))
        continue;
      this.pending.add(id);
      setLoading(paragraph);
      this.queue.push(paragraph);
    }
    this.pump();
  }

  private pump(): void {
    while (
      this.active &&
      this.runningWorkers < WORKER_COUNT &&
      this.queue.length > 0
    ) {
      const paragraph = this.queue.shift();
      if (!paragraph) return;
      this.runningWorkers += 1;
      void this.translate(paragraph).finally(() => {
        this.runningWorkers -= 1;
        this.pump();
      });
    }
  }

  private async translate(paragraph: Paragraph): Promise<void> {
    const generation = this.generation;
    const request = new AbortController();
    this.requests.add(request);
    try {
      const translation = await this.runtime.translateText(
        paragraph.text,
        this.config.sourceLanguage,
        this.config.targetLanguage,
        request.signal,
      );
      if (!this.active || generation !== this.generation) return;

      const fragment = decodePlaceholders(
        translation,
        paragraph.placeholders,
        PLACEHOLDER_STYLE,
      );
      const target = renderTranslation(paragraph, fragment, {
        mode: this.config.translationMode,
        theme: this.config.theme,
        wrapperTag: "font",
        prefix:
          this.rule.wrapperPrefix === "block" ||
          this.rule.wrapperPrefix === "inline"
            ? this.rule.wrapperPrefix
            : "smart",
      });
      target.dataset.imtUserscript = "translation";
      markTranslated(paragraph.container, paragraph.id);
      this.translated.add(paragraph.id);
    } catch (error) {
      if (
        !this.active ||
        generation !== this.generation ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      setError(paragraph, t("failed"), () => this.enqueue([paragraph.id]));
    } finally {
      this.requests.delete(request);
      this.pending.delete(paragraph.id);
    }
  }
}

function option(
  document: Document,
  value: string,
  label: string,
): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function selectRow(
  document: Document,
  labelText: string,
  select: HTMLSelectElement,
): HTMLLabelElement {
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, select);
  return label;
}

function mountMenu(
  controller: UserscriptPageController,
  runtime: UserscriptRuntime,
  initialConfig: UserscriptConfig,
  document: Document,
  locale: UserscriptLocale,
): () => void {
  const host = document.createElement("div");
  host.dataset.imt = "userscript-menu";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    button, select { font: 13px/1.35 system-ui, sans-serif; }
    .launcher { position: fixed; right: 18px; top: 52%; z-index: 2147483647; width: 38px; height: 38px; border: 0; border-radius: 19px; background: #2762d4; color: #fff; box-shadow: 0 5px 18px rgb(0 0 0 / 24%); cursor: pointer; font-weight: 700; }
    .panel { position: fixed; right: 18px; top: calc(52% + 46px); z-index: 2147483647; width: 238px; box-sizing: border-box; padding: 14px; border: 1px solid #d7dce5; border-radius: 12px; background: #fff; color: #16181d; box-shadow: 0 12px 34px rgb(0 0 0 / 24%); font: 13px/1.35 system-ui, sans-serif; }
    .panel[hidden] { display: none; }
    h2 { margin: 0 0 12px; font: 650 15px/1.3 system-ui, sans-serif; }
    label, .service { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 8px; margin: 8px 0; }
    select { min-width: 0; padding: 5px 6px; border: 1px solid #c8ced8; border-radius: 6px; background: #fff; color: #16181d; }
    .action { width: 100%; margin-top: 10px; padding: 8px 10px; border: 0; border-radius: 7px; background: #2762d4; color: #fff; cursor: pointer; }
    .status { min-height: 1.35em; margin: 8px 0 0; color: #b42318; }
    @media (prefers-color-scheme: dark) { .panel { border-color: #4b5260; background: #202329; color: #f5f7fa; } select { border-color: #59616f; background: #292d34; color: #f5f7fa; } }
  `;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "launcher";
  launcher.textContent = "译";
  launcher.title = t("name", locale);
  launcher.setAttribute("aria-label", t("menu", locale));

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.hidden = true;
  const heading = document.createElement("h2");
  heading.textContent = t("menu", locale);

  const service = document.createElement("div");
  service.className = "service";
  service.append(t("service", locale), t("google", locale));

  const language = document.createElement("select");
  for (const code of TARGET_LANGUAGES) {
    const names = LANGUAGE_NAMES[code];
    language.append(
      option(document, code, locale === "zh-CN" ? names[0] : names[1]),
    );
  }
  language.value = initialConfig.targetLanguage;

  const mode = document.createElement("select");
  mode.append(
    option(document, "dual", t("dual", locale)),
    option(document, "translation", t("translationOnly", locale)),
  );
  mode.value = initialConfig.translationMode;

  const theme = document.createElement("select");
  theme.append(
    option(document, "underline", t("underline", locale)),
    option(document, "highlight", t("highlight", locale)),
    option(document, "grey", t("grey", locale)),
  );
  theme.value = initialConfig.theme;

  const action = document.createElement("button");
  action.type = "button";
  action.className = "action";
  action.textContent = t("translate", locale);
  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");

  const save = async (patch: Partial<UserscriptConfig>): Promise<void> => {
    status.textContent = "";
    try {
      const config = await runtime.saveConfig(patch);
      controller.updateConfig(config);
    } catch {
      status.textContent = t("settingsFailed", locale);
    }
  };

  launcher.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    launcher.setAttribute("aria-expanded", String(!panel.hidden));
  });
  action.addEventListener("click", () => {
    controller.toggle();
    action.textContent = controller.isTranslated()
      ? t("showOriginal", locale)
      : t("translate", locale);
  });
  language.addEventListener("change", () => {
    void save({ targetLanguage: language.value as LangCode });
  });
  mode.addEventListener("change", () => {
    void save({
      translationMode: mode.value === "translation" ? "translation" : "dual",
    });
  });
  theme.addEventListener("change", () => {
    void save({ theme: theme.value as UserscriptTheme });
  });

  panel.append(
    heading,
    service,
    selectRow(document, t("targetLanguage", locale), language),
    selectRow(document, t("displayMode", locale), mode),
    selectRow(document, t("theme", locale), theme),
    action,
    status,
  );
  shadow.append(style, launcher, panel);
  document.documentElement.append(host);
  return () => host.remove();
}

export interface UserscriptHandle {
  controller: UserscriptPageController;
  dispose(): void;
}

export interface InitUserscriptOptions {
  runtime?: UserscriptRuntime;
  document?: Document;
  window?: Window;
  locale?: UserscriptLocale;
}

/** Initialize the page translator and floating popup shim. */
export async function init(
  options: InitUserscriptOptions = {},
): Promise<UserscriptHandle | undefined> {
  const document = options.document ?? globalThis.document;
  const window = options.window ?? globalThis.window;
  if (
    !document?.body ||
    !window ||
    isExcludedUserscriptPage(window.location.href, document.contentType)
  ) {
    return undefined;
  }

  const runtime = options.runtime ?? new GmUserscriptRuntime();
  const config = await runtime.getConfig();
  const rule = matchRuleInPage(window.location.href, [], document);
  const controller = new UserscriptPageController(
    runtime,
    config,
    rule,
    document,
  );
  const unmount = mountMenu(
    controller,
    runtime,
    config,
    document,
    options.locale ?? userscriptLocale(window.navigator.language),
  );
  return {
    controller,
    dispose() {
      controller.destroy();
      unmount();
    },
  };
}
