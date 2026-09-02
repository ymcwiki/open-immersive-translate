const zhCN = {
  title: "翻译本地字幕文件",
  description: "上传 SRT、WebVTT 或 ASS 文件，翻译后预览并下载。",
  chooseFile: "选择字幕文件",
  translate: "翻译全部字幕",
  translating: "正在翻译…",
  downloadBilingual: "下载双语字幕",
  downloadTranslation: "下载仅译文字幕",
  time: "时间",
  source: "原文",
  translation: "译文",
  empty: "请先选择字幕文件。",
  noCues: "文件中没有可识别的字幕。",
  loadFailed: "无法读取字幕文件。",
  configFailed: "无法读取翻译设置。",
  translateFailed: "字幕翻译失败。",
} as const;

export type SubtitleFileI18nKey = keyof typeof zhCN;

const en: Record<SubtitleFileI18nKey, string> = {
  title: "Translate a local subtitle file",
  description:
    "Upload an SRT, WebVTT, or ASS file, preview it, and download the translation.",
  chooseFile: "Choose subtitle file",
  translate: "Translate all subtitles",
  translating: "Translating…",
  downloadBilingual: "Download bilingual subtitles",
  downloadTranslation: "Download translation only",
  time: "Time",
  source: "Source",
  translation: "Translation",
  empty: "Choose a subtitle file first.",
  noCues: "No supported subtitle cues were found.",
  loadFailed: "Could not read the subtitle file.",
  configFailed: "Could not load translation settings.",
  translateFailed: "Subtitle translation failed.",
};

export function detectSubtitleFileLocale(
  language = navigator.language,
): "zh-CN" | "en" {
  return language.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

export function subtitleFileText(
  key: SubtitleFileI18nKey,
  locale = detectSubtitleFileLocale(),
): string {
  return { "zh-CN": zhCN, en }[locale]?.[key] ?? en[key];
}
