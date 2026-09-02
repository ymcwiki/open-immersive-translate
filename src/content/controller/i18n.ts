import { t, type UiLocale } from "../../ui/shared/i18n";

const messages = {
  "zh-CN": {
    selectionTranslating: "正在翻译…",
    translationFailed: "翻译失败",
    invalidTranslation: "译文格式错误",
  },
  en: {
    selectionTranslating: "Translating…",
    translationFailed: "Translation failed",
    invalidTranslation: "Invalid translation format",
  },
} as const;

export type ControllerI18nKey = keyof (typeof messages)["zh-CN"] | "loading";

function locale(): UiLocale {
  return navigator.language.toLocaleLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** Resolve controller strings through the existing UI helper with local fallbacks. */
export function controllerT(key: ControllerI18nKey): string {
  const selected = locale();
  if (key === "loading") return t("common.loading", {}, selected);
  return messages[selected][key] ?? messages.en[key];
}
