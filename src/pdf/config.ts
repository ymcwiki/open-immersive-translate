import type { Config, TranslationMode } from "../shared/types";
import type { PdfConfig } from "./types";

export const DEFAULT_PDF_CONFIG: PdfConfig = {
  interceptLinks: false,
  mode: "dual",
  theme: "underline",
};

interface ConfigWithPdf extends Config {
  pdf?: Partial<PdfConfig>;
}

export function readPdfConfig(config: Config): PdfConfig {
  const pdf = (config as ConfigWithPdf).pdf;
  return {
    interceptLinks:
      typeof pdf?.interceptLinks === "boolean"
        ? pdf.interceptLinks
        : DEFAULT_PDF_CONFIG.interceptLinks,
    mode: isTranslationMode(pdf?.mode) ? pdf.mode : config.translationMode,
    theme:
      typeof pdf?.theme === "string" && pdf.theme.trim()
        ? pdf.theme
        : config.theme,
  };
}

function isTranslationMode(value: unknown): value is TranslationMode {
  return value === "dual" || value === "translation";
}
