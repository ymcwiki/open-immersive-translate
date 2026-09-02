export type UserscriptLocale = "zh-CN" | "en";

const zhCN = {
  name: "双语网页翻译",
  menu: "翻译设置",
  translate: "翻译页面",
  showOriginal: "显示原文",
  targetLanguage: "目标语言",
  displayMode: "显示模式",
  theme: "译文样式",
  service: "翻译服务",
  google: "Google 翻译",
  dual: "双语",
  translationOnly: "仅译文",
  underline: "下划线",
  highlight: "高亮",
  grey: "灰色",
  failed: "翻译失败",
  settingsFailed: "设置保存失败",
  close: "关闭",
} as const;

export type UserscriptI18nKey = keyof typeof zhCN;

const en: Record<UserscriptI18nKey, string> = {
  name: "Bilingual Web Translator",
  menu: "Translation settings",
  translate: "Translate page",
  showOriginal: "Show original",
  targetLanguage: "Target language",
  displayMode: "Display mode",
  theme: "Translation style",
  service: "Translation service",
  google: "Google Translate",
  dual: "Bilingual",
  translationOnly: "Translation only",
  underline: "Underline",
  highlight: "Highlight",
  grey: "Grey",
  failed: "Translation failed",
  settingsFailed: "Could not save settings",
  close: "Close",
};

export function userscriptLocale(
  language = navigator.language,
): UserscriptLocale {
  return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** Resolve userscript UI copy, with English as the fallback table. */
export function t(
  key: UserscriptI18nKey,
  locale: UserscriptLocale = userscriptLocale(),
): string {
  return (locale === "zh-CN" ? zhCN[key] : undefined) ?? en[key];
}
