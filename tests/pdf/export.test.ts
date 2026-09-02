import { readFile } from "node:fs/promises";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  exportBilingualPdf,
  replaceUnsupportedCharacters,
  wrapPdfText,
} from "../../src/pdf/export";

describe("bilingual PDF export", () => {
  it("wraps measured text and replaces glyphs missing from the export font", () => {
    const font = { widthOfTextAtSize: (text: string) => text.length * 5 };
    expect(wrapPdfText("abcdef", font, 10, 15)).toEqual(["abc", "def"]);
    expect(replaceUnsupportedCharacters("A한", new Set([65, 63]))).toBe("A?");
  });

  it("keeps the original page and embeds a Chinese translation", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    const original = await source.save();
    const font = await readFile(
      "node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2",
    );

    const output = await exportBilingualPdf(
      original,
      [
        {
          id: "p1",
          pageNumber: 1,
          text: "Hello",
          translation: "你好，世界。",
          bbox: { x: 20, y: 20, width: 120, height: 12 },
          fontSize: 12,
          lineCount: 1,
          viewportWidth: 300,
          viewportHeight: 400,
        },
      ],
      new Uint8Array(font),
    );

    const exported = await PDFDocument.load(output);
    expect(exported.getPageCount()).toBe(1);
    expect(output.byteLength).toBeGreaterThan(original.byteLength);
  });
});
