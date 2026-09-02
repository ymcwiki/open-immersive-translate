import type { LangCode } from "../../shared/types";

export type ProviderLanguageMap = Readonly<Partial<Record<LangCode, string>>>;

const common = {
  auto: "auto",
  en: "en",
  "zh-CN": "zh",
  "zh-TW": "cht",
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
} as const satisfies ProviderLanguageMap;

export const LANGUAGE_MAPS = {
  ai: common,
  bing: { ...common, "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" },
  azure: { ...common, "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" },
  deepl: {
    ...common,
    auto: "",
    en: "EN-US",
    "zh-CN": "ZH-HANS",
    "zh-TW": "ZH-HANT",
    ja: "JA",
    ko: "KO",
    fr: "FR",
    de: "DE",
    es: "ES",
    ru: "RU",
    pt: "PT-PT",
    it: "IT",
    ar: "AR",
    vi: "VI",
    th: "TH",
  },
  volc: { ...common, auto: "", "zh-CN": "zh", "zh-TW": "zh-Hant" },
  tencent: { ...common, "zh-CN": "zh", "zh-TW": "zh-TW" },
  baidu: {
    ...common,
    "zh-CN": "zh",
    "zh-TW": "cht",
    ja: "jp",
    ko: "kor",
    fr: "fra",
    es: "spa",
    ar: "ara",
    vi: "vie",
  },
  youdao: { ...common, "zh-CN": "zh-CHS", "zh-TW": "zh-CHT" },
  caiyun: {
    auto: "auto",
    en: "en",
    "zh-CN": "zh",
    "zh-TW": "zh-Hant",
    ja: "ja",
  },
  aliyun: { ...common, "zh-CN": "zh", "zh-TW": "zh-tw" },
  papago: {
    auto: "auto",
    en: "en",
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    ja: "ja",
    ko: "ko",
    fr: "fr",
    de: "de",
    es: "es",
    ru: "ru",
    it: "it",
    vi: "vi",
    th: "th",
  },
  yandex: { ...common, "zh-CN": "zh", "zh-TW": "zh" },
  transmart: { ...common, "zh-CN": "zh", "zh-TW": "zh-TW", ja: "ja" },
  niutrans: { ...common, "zh-CN": "zh", "zh-TW": "cht", ja: "ja" },
  openl: { ...common, "zh-CN": "zh-CN", "zh-TW": "zh-TW" },
} as const satisfies Record<string, ProviderLanguageMap>;

export const DEEPL_SOURCE_LANGUAGE_MAP = {
  ...LANGUAGE_MAPS.deepl,
  en: "EN",
  "zh-CN": "ZH",
  "zh-TW": "ZH",
  pt: "PT",
} as const satisfies ProviderLanguageMap;

export function providerLanguage(
  code: LangCode,
  map: ProviderLanguageMap,
): string | undefined {
  return map[code];
}

export function supportsMappedPair(
  from: LangCode,
  to: LangCode,
  map: ProviderLanguageMap,
): boolean {
  const providerFrom = map[from];
  const providerTo = map[to];
  return (
    from !== to &&
    providerFrom !== undefined &&
    Boolean(providerTo) &&
    (from === "auto" || providerFrom !== providerTo)
  );
}
