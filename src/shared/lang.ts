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
  const counts = {
    han: 0,
    kana: 0,
    hangul: 0,
    latin: 0,
    cyrillic: 0,
    arabic: 0,
  };

  for (const character of text) {
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) {
      counts.kana += 1;
    } else if (/\p{Script=Hangul}/u.test(character)) {
      counts.hangul += 1;
    } else if (/\p{Script=Han}/u.test(character)) {
      counts.han += 1;
    } else if (/\p{Script=Latin}/u.test(character)) {
      counts.latin += 1;
    } else if (/\p{Script=Cyrillic}/u.test(character)) {
      counts.cyrillic += 1;
    } else if (/\p{Script=Arabic}/u.test(character)) {
      counts.arabic += 1;
    }
  }

  const scriptTotal = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (scriptTotal < 2) return "auto";

  if (counts.kana / scriptTotal >= 0.05) return "ja";
  if (counts.hangul / scriptTotal >= 0.2) return "ko";
  if (counts.han / scriptTotal >= 0.4) return "zh-CN";
  if (counts.cyrillic / scriptTotal >= 0.4) return "ru";
  if (counts.arabic / scriptTotal >= 0.4) return "ar";
  if (counts.latin / scriptTotal < 0.6) return "auto";

  const words = text.toLocaleLowerCase().match(/\p{Script=Latin}+/gu) ?? [];
  const commonWords: Readonly<Record<"en" | "fr" | "de" | "es", Set<string>>> =
    {
      en: new Set([
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "for",
        "from",
        "in",
        "is",
        "it",
        "of",
        "on",
        "that",
        "the",
        "this",
        "to",
        "was",
        "with",
      ]),
      fr: new Set([
        "au",
        "aux",
        "avec",
        "ce",
        "dans",
        "de",
        "des",
        "du",
        "elle",
        "est",
        "et",
        "la",
        "le",
        "les",
        "pour",
        "que",
        "qui",
        "un",
        "une",
      ]),
      de: new Set([
        "auf",
        "das",
        "dem",
        "den",
        "der",
        "des",
        "die",
        "ein",
        "eine",
        "für",
        "ist",
        "mit",
        "nicht",
        "und",
        "von",
        "zu",
      ]),
      es: new Set([
        "al",
        "con",
        "de",
        "del",
        "el",
        "en",
        "es",
        "la",
        "las",
        "los",
        "para",
        "por",
        "que",
        "se",
        "un",
        "una",
        "y",
      ]),
    };

  const scores = (Object.keys(commonWords) as Array<keyof typeof commonWords>)
    .map((language) => ({
      language,
      score: words.filter((word) => commonWords[language].has(word)).length,
    }))
    .sort((left, right) => right.score - left.score);
  if ((scores[0]?.score ?? 0) === 0) return "auto";
  if (scores[0]?.score === scores[1]?.score) return "auto";
  return scores[0]?.language ?? "auto";
}
