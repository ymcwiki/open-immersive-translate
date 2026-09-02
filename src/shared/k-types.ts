import type {
  Config,
  LangCode,
  Rule,
  ServiceConfig,
  TranslationMode,
} from "./types";

export type UiLocale = "zh-CN" | "zh-TW" | "ja" | "en";
export type UiLocaleSetting = UiLocale | "auto";
export type SelectionTriggerMode = "icon-hover" | "icon-click" | "direct";
export type InputTriggerMode = "prefix" | "trailing" | "both";

export interface SubtitleStyleConfig {
  mode: "dual" | "translation" | "source";
  fontSize: number;
  color: string;
  background: string;
  position: "top" | "bottom";
}

export interface AiWritingPrompts {
  summarize: string;
  polish: string;
  translate: string;
  suggestions: string;
}

export interface PatternModeConfig {
  dualMatches: string[];
  translationMatches: string[];
}

export type TranslationThemePatterns = Record<string, string[]>;

export interface KConfig extends Omit<
  Config,
  "input" | "selection" | "subtitle"
> {
  uiLanguage: UiLocaleSetting;
  input: Config["input"] & {
    triggerMode: InputTriggerMode;
    startingTriggerKey: string;
    trailingTriggerKey: string;
    trailingTriggerCount: number;
    trailingTriggerTimeoutMs: number;
    languageAliases: Record<string, string[]>;
    showTargetBar: boolean;
    autoTargetLanguage: boolean;
  };
  selection: Config["selection"] & {
    dictionary: boolean;
    autoRead: boolean;
    triggerMode: SelectionTriggerMode;
    enabledPatterns: string[];
    voiceByLanguage: Record<string, string>;
  };
  subtitle: Config["subtitle"] & {
    style: SubtitleStyleConfig;
  };
  pdf: {
    enabled: boolean;
    autoOpenOnline: boolean;
    translationMode: TranslationMode;
  };
  sidePanel: {
    enabled: boolean;
    service?: string;
    targetLanguage?: LangCode;
    historyLimit: number;
  };
  aiWriting: {
    enabled: boolean;
    service?: string;
    targetLanguage?: LangCode;
    prompts: AiWritingPrompts;
  };
  translationModeLanguagePattern: PatternModeConfig;
  translationModeUrlPattern: PatternModeConfig;
  translationThemePatterns: TranslationThemePatterns;
  globalCss: string;
}

export const DEFAULT_INPUT_LANGUAGE_ALIASES: Record<string, string[]> = {
  en: ["en", "english", "英文", "英语"],
  "zh-CN": ["zh", "zh-cn", "中文", "简中"],
  "zh-TW": ["zht", "zh-tw", "繁中"],
  ja: ["ja", "jp", "日语", "日文"],
  ko: ["ko", "kr", "韩语", "韩文"],
  fr: ["fr", "法语"],
  de: ["de", "德语"],
  es: ["es", "西语", "西班牙语"],
  ru: ["ru", "俄语"],
};

export const DEFAULT_AI_WRITING_PROMPTS: AiWritingPrompts = {
  summarize: "用简洁的语言总结以下内容，保留关键事实。",
  polish: "润色以下内容，使表达自然、清楚，不改变原意。",
  translate: "把以下内容翻译成目标语言，只输出译文。",
  suggestions: "根据以下内容给出 3 个可直接使用的写作建议。",
};

const DEFAULT_SELECTION_PATTERNS = ["<all_urls>"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [...fallback];
}

function stringArrayRecord(
  value: unknown,
  fallback: Record<string, string[]> = {},
): Record<string, string[]> {
  if (!isRecord(value)) return structuredClone(fallback);
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, items]) => {
      const parsed = stringArray(items);
      return parsed.length || (Array.isArray(items) && items.length === 0)
        ? [[key, parsed]]
        : [];
    }),
  );
}

/** Merge validated core settings with K-owned phase-3 defaults. */
export function withKDefaults(value: unknown): KConfig {
  const raw = record(value);
  const core = coreConfig(raw);
  const input = record(raw.input);
  const selection = record(raw.selection);
  const subtitle = record(raw.subtitle);
  const subtitleStyle = record(subtitle.style);
  const pdf = record(raw.pdf);
  const sidePanel = record(raw.sidePanel);
  const aiWriting = record(raw.aiWriting);
  const prompts = record(aiWriting.prompts);
  const locale = raw.uiLanguage;

  return {
    ...core,
    uiLanguage:
      locale === "zh-CN" ||
      locale === "zh-TW" ||
      locale === "ja" ||
      locale === "en"
        ? locale
        : "auto",
    input: {
      ...core.input,
      triggerMode:
        input.triggerMode === "prefix" ||
        input.triggerMode === "trailing" ||
        input.triggerMode === "both"
          ? input.triggerMode
          : "both",
      startingTriggerKey: stringValue(input.startingTriggerKey, "/"),
      trailingTriggerKey: stringValue(input.trailingTriggerKey, " "),
      trailingTriggerCount: positiveInteger(input.trailingTriggerCount, 3),
      trailingTriggerTimeoutMs: positiveInteger(
        input.trailingTriggerTimeoutMs,
        1_500,
      ),
      languageAliases: stringArrayRecord(
        input.languageAliases,
        DEFAULT_INPUT_LANGUAGE_ALIASES,
      ),
      showTargetBar: booleanValue(input.showTargetBar, true),
      autoTargetLanguage: booleanValue(input.autoTargetLanguage, false),
    },
    selection: {
      ...core.selection,
      dictionary: booleanValue(selection.dictionary, true),
      autoRead: booleanValue(selection.autoRead, false),
      triggerMode:
        selection.triggerMode === "icon-hover" ||
        selection.triggerMode === "direct"
          ? selection.triggerMode
          : "icon-click",
      enabledPatterns: stringArray(
        selection.enabledPatterns,
        DEFAULT_SELECTION_PATTERNS,
      ),
      voiceByLanguage: Object.fromEntries(
        Object.entries(record(selection.voiceByLanguage)).flatMap(
          ([language, voice]) =>
            typeof voice === "string" ? [[language, voice]] : [],
        ),
      ),
    },
    subtitle: {
      ...core.subtitle,
      style: {
        mode:
          subtitleStyle.mode === "translation" ||
          subtitleStyle.mode === "source"
            ? subtitleStyle.mode
            : "dual",
        fontSize: positiveInteger(subtitleStyle.fontSize, 20),
        color: stringValue(subtitleStyle.color, "#ffffff"),
        background: stringValue(
          subtitleStyle.background,
          "rgba(0, 0, 0, 0.72)",
        ),
        position: subtitleStyle.position === "top" ? "top" : "bottom",
      },
    },
    pdf: {
      enabled: booleanValue(pdf.enabled, true),
      autoOpenOnline: booleanValue(pdf.autoOpenOnline, false),
      translationMode:
        pdf.translationMode === "translation" ? "translation" : "dual",
    },
    sidePanel: {
      enabled: booleanValue(sidePanel.enabled, true),
      service:
        typeof sidePanel.service === "string" ? sidePanel.service : undefined,
      targetLanguage:
        typeof sidePanel.targetLanguage === "string"
          ? (sidePanel.targetLanguage as LangCode)
          : undefined,
      historyLimit: positiveInteger(sidePanel.historyLimit, 50),
    },
    aiWriting: {
      enabled: booleanValue(aiWriting.enabled, true),
      service:
        typeof aiWriting.service === "string" ? aiWriting.service : undefined,
      targetLanguage:
        typeof aiWriting.targetLanguage === "string"
          ? (aiWriting.targetLanguage as LangCode)
          : undefined,
      prompts: {
        summarize: stringValue(
          prompts.summarize,
          DEFAULT_AI_WRITING_PROMPTS.summarize,
        ),
        polish: stringValue(prompts.polish, DEFAULT_AI_WRITING_PROMPTS.polish),
        translate: stringValue(
          prompts.translate,
          DEFAULT_AI_WRITING_PROMPTS.translate,
        ),
        suggestions: stringValue(
          prompts.suggestions,
          DEFAULT_AI_WRITING_PROMPTS.suggestions,
        ),
      },
    },
    translationModeLanguagePattern: patternModes(
      raw.translationModeLanguagePattern,
    ),
    translationModeUrlPattern: patternModes(raw.translationModeUrlPattern),
    translationThemePatterns: stringArrayRecord(raw.translationThemePatterns),
    globalCss: stringValue(raw.globalCss, ""),
  };
}

function patternModes(value: unknown): PatternModeConfig {
  const current = record(value);
  return {
    dualMatches: stringArray(current.dualMatches),
    translationMatches: stringArray(current.translationMatches),
  };
}

function coreConfig(raw: Record<string, unknown>): Config {
  const input = record(raw.input);
  const hover = record(raw.hover);
  const selection = record(raw.selection);
  const floatBall = record(raw.floatBall);
  const subtitle = record(raw.subtitle);
  const cache = record(raw.cache);
  const services: Record<string, ServiceConfig> = isRecord(raw.services)
    ? (raw.services as Record<string, ServiceConfig>)
    : {
        "openai-compatible": {
          kind: "openai-compatible",
          enabled: false,
        },
        claude: { kind: "claude", enabled: false },
        google: { kind: "google", enabled: true },
        deeplx: { kind: "deeplx", enabled: false },
        "custom-http": { kind: "custom-http", enabled: false },
        mock: { kind: "mock", enabled: false },
      };
  return {
    version:
      typeof raw.version === "number" && Number.isInteger(raw.version)
        ? raw.version
        : 1,
    targetLanguage:
      typeof raw.targetLanguage === "string"
        ? (raw.targetLanguage as LangCode)
        : "zh-CN",
    sourceLanguage:
      typeof raw.sourceLanguage === "string"
        ? (raw.sourceLanguage as LangCode)
        : "auto",
    translationMode:
      raw.translationMode === "translation" ? "translation" : "dual",
    theme: stringValue(raw.theme, "underline"),
    font: typeof raw.font === "string" ? raw.font : undefined,
    service: stringValue(raw.service, "google"),
    services,
    shortcuts: isRecord(raw.shortcuts)
      ? (raw.shortcuts as Record<string, string>)
      : {
          "toggle-translate": "Alt+A",
          "toggle-whole-page": "Alt+W",
          "translate-input": "Alt+I",
        },
    alwaysTranslateSites: stringArray(raw.alwaysTranslateSites),
    neverTranslateSites: stringArray(raw.neverTranslateSites),
    alwaysTranslateLangs: stringArray(raw.alwaysTranslateLangs) as LangCode[],
    neverTranslateLangs: stringArray(raw.neverTranslateLangs) as LangCode[],
    glossaries: Array.isArray(raw.glossaries)
      ? (raw.glossaries as Config["glossaries"])
      : [],
    userRules: Array.isArray(raw.userRules) ? (raw.userRules as Rule[]) : [],
    input: {
      enabled: booleanValue(input.enabled, true),
      trigger: input.trigger === "space3" ? "space3" : "//",
      targetLanguage:
        typeof input.targetLanguage === "string"
          ? (input.targetLanguage as LangCode)
          : undefined,
    },
    hover: {
      enabled: booleanValue(hover.enabled, false),
      holdKey:
        hover.holdKey === "Ctrl" || hover.holdKey === "Shift"
          ? hover.holdKey
          : "Alt",
    },
    selection: { enabled: booleanValue(selection.enabled, true) },
    floatBall: {
      enabled: booleanValue(floatBall.enabled, true),
      position: floatBall.position === "left" ? "left" : "right",
    },
    subtitle: { youtube: booleanValue(subtitle.youtube, true) },
    cache: {
      enabled: booleanValue(cache.enabled, true),
      maxAgeDays: positiveInteger(cache.maxAgeDays, 30),
    },
  };
}
