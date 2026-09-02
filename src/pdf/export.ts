import fontkit from "@pdf-lib/fontkit";
import notoSansScUrl from "@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2?url";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";

import type { PositionedPdfParagraph } from "./types";

export interface ExportPdfParagraph extends PositionedPdfParagraph {
  translation: string;
}

export async function loadBundledPdfFont(): Promise<Uint8Array> {
  const response = await fetch(notoSansScUrl);
  if (!response.ok) throw new Error("Bundled PDF font could not be loaded");
  return new Uint8Array(await response.arrayBuffer());
}

/** Draw translated text on a copy of the source PDF. */
export async function exportBilingualPdf(
  original: Uint8Array,
  paragraphs: readonly ExportPdfParagraph[],
  fontBytes: Uint8Array | Promise<Uint8Array> = loadBundledPdfFont(),
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original.slice());
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await fontBytes, { subset: true });
  const supported = new Set(font.getCharacterSet());

  for (const paragraph of paragraphs) {
    const page = pdf.getPage(paragraph.pageNumber - 1);
    if (!page || !paragraph.translation.trim()) continue;
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const scaleX = pageWidth / paragraph.viewportWidth;
    const scaleY = pageHeight / paragraph.viewportHeight;
    const fontSize = clamp(paragraph.fontSize * scaleY * 0.78, 6, 11);
    const lineHeight = fontSize * 1.25;
    const x = clamp(paragraph.bbox.x * scaleX, 4, pageWidth - 4);
    const maxWidth = Math.max(
      36,
      Math.min(paragraph.bbox.width * scaleX, pageWidth - x - 4),
    );
    const sourceBottom = (paragraph.bbox.y + paragraph.bbox.height) * scaleY;
    let y = pageHeight - sourceBottom - lineHeight;
    const safeText = replaceUnsupportedCharacters(
      paragraph.translation,
      supported,
    );

    for (const line of wrapPdfText(safeText, font, fontSize, maxWidth)) {
      if (y < 4) break;
      page.drawText(line, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.12, 0.34, 0.66),
        opacity: 0.94,
      });
      y -= lineHeight;
    }
  }

  return pdf.save();
}

export function replaceUnsupportedCharacters(
  text: string,
  supported: ReadonlySet<number>,
): string {
  const replacement = supported.has("□".codePointAt(0) ?? 0) ? "□" : "?";
  return Array.from(text, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && supported.has(codePoint)
      ? character
      : replacement;
  }).join("");
}

export function wrapPdfText(
  text: string,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  fontSize: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const sourceLine of text.split(/\r?\n/u)) {
    let line = "";
    for (const character of sourceLine) {
      const candidate = line + character;
      if (line && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line || !sourceLine) lines.push(line.trimEnd());
  }
  return lines;
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
