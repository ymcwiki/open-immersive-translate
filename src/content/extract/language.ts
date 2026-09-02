import { normalizeLang } from "../../shared/lang";
import type { LangCode, TranslationLanguagePair } from "../../shared/types";
import { isSameLang } from "../../shared/lang";

type DetectableLanguage = Exclude<LangCode, "auto" | "zh-TW">;

const STOPWORDS: Readonly<Record<DetectableLanguage, readonly string[]>> = {
  en: [
    "the", "and", "is", "are", "of", "to", "in", "that", "with", "for",
    "this", "from", "was", "on", "as", "by", "be", "which", "or", "an",
  ],
  fr: [
    "le", "la", "les", "des", "une", "un", "et", "est", "dans", "pour",
    "que", "qui", "avec", "sur", "du", "au", "aux", "ce", "cette", "sont",
  ],
  de: [
    "der", "die", "das", "und", "ist", "ein", "eine", "mit", "zu", "den",
    "dem", "des", "für", "auf", "nicht", "sich", "von", "im", "auch", "wird",
  ],
  es: [
    "el", "la", "los", "las", "una", "un", "y", "es", "en", "de", "del",
    "que", "para", "con", "por", "se", "como", "su", "al", "esta",
  ],
  it: [
    "il", "lo", "la", "gli", "le", "un", "una", "e", "è", "di", "del",
    "della", "che", "per", "con", "nel", "non", "sono", "come", "questa",
  ],
  pt: [
    "o", "a", "os", "as", "um", "uma", "e", "é", "de", "do", "da", "dos",
    "das", "que", "para", "com", "em", "não", "no", "na", "esta",
  ],
  vi: [
    "và", "là", "của", "có", "trong", "cho", "với", "một", "những", "các",
    "được", "không", "này", "từ", "khi", "để", "người", "đã", "sẽ", "về",
  ],
  ru: [
    "и", "в", "не", "на", "что", "с", "это", "как", "по", "из", "для",
    "к", "его", "она", "они", "был", "есть", "но", "от", "за", "так",
  ],
  ja: [
    "これ", "それ", "この", "その", "です", "ます", "から", "まで", "として",
    "について", "には", "では", "こと", "もの", "ため", "いる", "ある",
  ],
  ko: [
    "이", "그", "저", "것", "수", "있다", "합니다", "에서", "으로", "하고",
    "그리고", "하지만", "대한", "위해", "있는", "없는", "입니다",
  ],
  "zh-CN": [
    "的", "了", "在", "是", "和", "与", "对", "这", "那", "有", "为", "从",
    "我们", "你们", "他们", "一个", "可以", "进行", "以及", "但是",
  ],
  ar: [
    "في", "من", "على", "إلى", "عن", "هذا", "هذه", "هو", "هي", "التي",
    "الذي", "مع", "كان", "كانت", "أن", "لا", "ما", "كما", "بين", "بعد",
  ],
  th: [
    "ที่", "และ", "ใน", "ของ", "เป็น", "มี", "ได้", "ให้", "จาก", "กับ", "ว่า",
    "ไม่", "นี้", "นั้น", "เพื่อ", "โดย", "หรือ", "เรา", "คุณ", "การ",
  ],
};

const LATIN_LANGUAGES = ["en", "fr", "de", "es", "it", "pt", "vi"] as const;

interface ScriptCounts {
  latin: number;
  han: number;
  kana: number;
  hangul: number;
  cyrillic: number;
  arabic: number;
  thai: number;
}

function countScripts(text: string): ScriptCounts {
  const counts: ScriptCounts = {
    latin: 0,
    han: 0,
    kana: 0,
    hangul: 0,
    cyrillic: 0,
    arabic: 0,
    thai: 0,
  };
  for (const character of text) {
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) counts.kana += 1;
    else if (/\p{Script=Hangul}/u.test(character)) counts.hangul += 1;
    else if (/\p{Script=Han}/u.test(character)) counts.han += 1;
    else if (/\p{Script=Cyrillic}/u.test(character)) counts.cyrillic += 1;
    else if (/\p{Script=Arabic}/u.test(character)) counts.arabic += 1;
    else if (/\p{Script=Thai}/u.test(character)) counts.thai += 1;
    else if (/\p{Script=Latin}/u.test(character)) counts.latin += 1;
  }
  return counts;
}

function countStopwords(text: string, language: DetectableLanguage): number {
  const lower = text.toLocaleLowerCase();
  if (["zh-CN", "ja", "ko", "th"].includes(language)) {
    return STOPWORDS[language].reduce(
      (score, word) => score + (lower.includes(word) ? 1 : 0),
      0,
    );
  }
  const words = lower.match(/[\p{L}\p{M}]+/gu) ?? [];
  const stopwords = new Set(STOPWORDS[language]);
  return words.reduce((score, word) => score + (stopwords.has(word) ? 1 : 0), 0);
}

function scriptLanguage(counts: ScriptCounts, total: number): LangCode | null {
  if (counts.kana / total >= 0.03) return "ja";
  if (counts.hangul / total >= 0.2) return "ko";
  if (counts.han / total >= 0.35) return "zh-CN";
  if (counts.cyrillic / total >= 0.45) return "ru";
  if (counts.arabic / total >= 0.45) return "ar";
  if (counts.thai / total >= 0.45) return "th";
  return null;
}

/** Detect the supported source languages without sending page text off-device. */
export function detectTextLanguage(text: string): LangCode {
  const counts = countScripts(text);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total < 2) return "auto";

  const scripted = scriptLanguage(counts, total);
  if (scripted) return scripted;
  if (counts.latin / total < 0.6) return "auto";

  const scores = LATIN_LANGUAGES.map((language) => ({
    language,
    score: countStopwords(text, language),
  })).sort((left, right) => right.score - left.score);
  const best = scores[0];
  const next = scores[1];
  if (!best || best.score < 2 || best.score === next?.score) return "auto";
  return best.language;
}

/** Prefer a valid html lang declaration, then inspect the first page-text sample. */
export function detectPageLanguage(doc: Document, sampleLimit = 4000): LangCode {
  const declared = normalizeLang(doc.documentElement.lang);
  if (declared !== "auto") return declared;
  const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ").slice(0, sampleLimit);
  return detectTextLanguage(text);
}

/** Decide whether a paragraph already uses the configured target language. */
export function isParagraphTargetLanguage(
  text: string,
  target: LangCode,
  configuredPairs: readonly TranslationLanguagePair[] = [],
): boolean {
  const detected = detectTextLanguage(text);
  return detected !== "auto" && isSameLang(detected, target, configuredPairs);
}
