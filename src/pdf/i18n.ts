import { t, type I18nKey, type UiLocale } from "../ui/shared/i18n";

const zhCN = {
  title: "PDF 双语翻译",
  openFile: "打开本地 PDF",
  dropFile: "拖放 PDF 到此处",
  previousPage: "上一页",
  nextPage: "下一页",
  page: "页码",
  pageCount: "共 {count} 页",
  zoomOut: "缩小",
  zoomIn: "放大",
  service: "翻译服务",
  targetLanguage: "目标语言",
  translateAll: "翻译全部",
  download: "下载双语 PDF",
  loading: "正在加载 PDF…",
  loadFailed: "无法打开 PDF：{message}",
  empty: "打开本地文件，或使用带 ?file= 的 PDF 地址。",
  rendering: "正在渲染第 {page} 页…",
  pageFailed: "第 {page} 页渲染失败",
  exporting: "正在生成双语 PDF…",
  exportReady: "双语 PDF 已下载",
  exportWait: "请等待“翻译全部”完成后再下载",
  exportFailed: "无法生成双语 PDF：{message}",
  progress: "已载入 {loaded}/{pages} 页，已翻译 {translated}/{paragraphs} 段",
  dragActive: "松开即可打开 PDF",
} as const;

type PdfI18nKey = keyof typeof zhCN;

const en: Record<PdfI18nKey, string> = {
  title: "Bilingual PDF Translator",
  openFile: "Open local PDF",
  dropFile: "Drop a PDF here",
  previousPage: "Previous page",
  nextPage: "Next page",
  page: "Page",
  pageCount: "{count} pages",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  service: "Translation service",
  targetLanguage: "Target language",
  translateAll: "Translate all",
  download: "Download bilingual PDF",
  loading: "Loading PDF…",
  loadFailed: "Could not open PDF: {message}",
  empty: "Open a local file or pass a PDF URL with ?file=.",
  rendering: "Rendering page {page}…",
  pageFailed: "Could not render page {page}",
  exporting: "Creating bilingual PDF…",
  exportReady: "Bilingual PDF downloaded",
  exportWait: "Wait for Translate all to finish before downloading",
  exportFailed: "Could not create bilingual PDF: {message}",
  progress:
    "Loaded {loaded}/{pages} pages, translated {translated}/{paragraphs} paragraphs",
  dragActive: "Release to open the PDF",
};

export function currentPdfLocale(): UiLocale {
  return globalThis.navigator?.language?.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en";
}

export function pdfT(
  key: PdfI18nKey,
  values: Record<string, string | number> = {},
  locale = currentPdfLocale(),
): string {
  const source = locale === "zh-CN" ? zhCN : en;
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    source[key],
  );
}

export function sharedLabel(key: I18nKey, locale = currentPdfLocale()): string {
  return t(key, {}, locale);
}

const SERVICE_KEYS: Record<string, I18nKey> = {
  "openai-compatible": "service.openai-compatible",
  claude: "service.claude",
  google: "service.google",
  deeplx: "service.deeplx",
  "custom-http": "service.custom-http",
  mock: "service.mock",
};

export function pdfServiceName(
  id: string,
  locale = currentPdfLocale(),
): string {
  const key = SERVICE_KEYS[id];
  return key ? t(key, {}, locale) : id;
}

export function pdfLanguageName(
  code: string,
  locale = currentPdfLocale(),
): string {
  return t(`lang.${code}` as I18nKey, {}, locale);
}
