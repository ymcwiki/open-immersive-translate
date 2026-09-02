export type SubtitleLocale = "zh-CN" | "en";

const zhCN = {
  experimental: "实验性字幕适配",
} as const;

type SubtitleI18nKey = keyof typeof zhCN;

const en: Record<SubtitleI18nKey, string> = {
  experimental: "Experimental subtitle adapter",
};

export function subtitleLocale(language = navigator.language): SubtitleLocale {
  return language.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

export function subtitleText(
  key: SubtitleI18nKey,
  locale = subtitleLocale(),
): string {
  return { "zh-CN": zhCN, en }[locale]?.[key] ?? en[key];
}
