import type { Config } from "./types";

export type UiLocale = "zh-CN" | "zh-TW" | "ja" | "en";
export type UiLocaleSetting = UiLocale | "auto";
export type SelectionTriggerMode = Config["selection"]["triggerMode"];
export type InputTriggerMode = Config["input"]["triggerMode"];
export type AiWritingPrompts = Config["aiWriting"]["prompts"];
export type PatternModeConfig = Config["translationModeUrlPattern"];
export type TranslationThemePatterns = Config["translationThemePatterns"];
export type KConfig = Config;

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

/** Compatibility helper for callers that already hold a schema-validated config. */
export function withKDefaults(value: unknown): KConfig {
  const config = (
    value && typeof value === "object" ? value : {}
  ) as Partial<Config>;
  return {
    ...config,
    input: {
      enabled: true,
      trigger: "//",
      triggerMode: "both",
      startingTriggerKey: "/",
      trailingTriggerKey: " ",
      trailingTriggerCount: 3,
      trailingTriggerTimeoutMs: 1_500,
      languageAliases: DEFAULT_INPUT_LANGUAGE_ALIASES,
      showTargetBar: true,
      autoTargetLanguage: false,
      ...config.input,
    },
    selection: {
      enabled: true,
      dictionary: true,
      autoRead: false,
      triggerMode: "icon-click",
      enabledPatterns: ["<all_urls>"],
      voiceByLanguage: {},
      ...config.selection,
    },
    aiWriting: {
      enabled: true,
      ...config.aiWriting,
      prompts: {
        ...DEFAULT_AI_WRITING_PROMPTS,
        ...config.aiWriting?.prompts,
      },
    },
  } as KConfig;
}
