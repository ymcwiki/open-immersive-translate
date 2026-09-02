import type { TranslationMode } from "../shared/types";

export interface PdfConfig {
  interceptLinks: boolean;
  mode: TranslationMode;
  theme: string;
}

export interface PdfBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfParagraph {
  text: string;
  bbox: PdfBoundingBox;
  fontSize: number;
  lineCount: number;
}

export interface PositionedPdfParagraph extends PdfParagraph {
  id: string;
  pageNumber: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface PdfTranslationState {
  text?: string;
  error?: string;
  loading: boolean;
}
