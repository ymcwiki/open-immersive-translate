import type { LangCode, TranslationLanguagePair } from "./types";

/** All language codes currently accepted by configuration and messages. */
export const LANGUAGE_CODES = [
  "auto",
  "en",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "ru",
  "pt",
  "it",
  "ar",
  "vi",
  "th",
] as const satisfies readonly LangCode[];

/** English display labels for supported language codes. */
export const LANGUAGE_DISPLAY_NAMES: Readonly<Record<LangCode, string>> = {
  auto: "Auto detect",
  en: "English",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
  pt: "Portuguese",
  it: "Italian",
  ar: "Arabic",
  vi: "Vietnamese",
  th: "Thai",
};

const LANGUAGE_ALIASES: Readonly<Record<string, LangCode>> = {
  auto: "auto",
  en: "en",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-tw": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW",
  "zh-hant": "zh-TW",
  ja: "ja",
  ko: "ko",
  fr: "fr",
  de: "de",
  es: "es",
  ru: "ru",
  pt: "pt",
  it: "it",
  ar: "ar",
  vi: "vi",
  th: "th",
};

/** Convert common BCP-47 variants and aliases to a supported language code. */
export function normalizeLang(value: string | null | undefined): LangCode {
  if (!value) return "auto";

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  const exact = LANGUAGE_ALIASES[normalized];
  if (exact) return exact;

  const base = normalized.split("-")[0];
  return (base && LANGUAGE_ALIASES[base]) || "auto";
}

/**
 * Compare two languages for skip-translation decisions.
 * Chinese variants compare equal unless their directional pair is configured.
 */
export function isSameLang(
  left: LangCode,
  right: LangCode,
  configuredPairs: readonly TranslationLanguagePair[] = [],
): boolean {
  const from = normalizeLang(left);
  const to = normalizeLang(right);

  if (from === to) return true;

  const isChinesePair =
    (from === "zh-CN" && to === "zh-TW") ||
    (from === "zh-TW" && to === "zh-CN");
  if (!isChinesePair) return false;

  return !configuredPairs.some(
    (pair) =>
      normalizeLang(pair.from) === from && normalizeLang(pair.to) === to,
  );
}

/** Detect a text's language. */
export function detectLang(text: string): LangCode {
  // TODO(phase1:extract): Replace with the selected local language detector.
  void text;
  return "auto";
}
