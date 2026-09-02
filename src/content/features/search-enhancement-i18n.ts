export type SearchEnhancementLocale = "zh-CN" | "en";

const messages = {
  "zh-CN": {
    label: "英语搜索",
    prompt: "同时查看英语搜索结果",
    link: "用英语搜索“{query}”",
  },
  en: {
    label: "English search",
    prompt: "See search results in English too",
    link: "Search “{query}” in English",
  },
} as const;

type SearchEnhancementMessage = keyof (typeof messages)["zh-CN"];

export function searchEnhancementLocale(
  language: string | null | undefined,
): SearchEnhancementLocale {
  return language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function searchEnhancementText(
  key: SearchEnhancementMessage,
  locale: SearchEnhancementLocale,
  values: Record<string, string> = {},
): string {
  let message: string = messages[locale][key];
  for (const [name, value] of Object.entries(values)) {
    message = message.replaceAll(`{${name}}`, value);
  }
  return message;
}
