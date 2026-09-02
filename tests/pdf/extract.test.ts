import { describe, expect, it } from "vitest";

import { extractPdfParagraphs } from "../../src/pdf/extract";

interface FixtureItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

const viewport = {
  width: 600,
  height: 800,
  scale: 1,
  convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
};

function item(
  str: string,
  x: number,
  baseline: number,
  width: number,
  options: { size?: number; hasEOL?: boolean } = {},
): FixtureItem {
  const size = options.size ?? 12;
  return {
    str,
    dir: "ltr",
    transform: [size, 0, 0, size, x, baseline],
    width,
    height: size,
    fontName: "body",
    hasEOL: options.hasEOL ?? true,
  };
}

function content(items: FixtureItem[]) {
  return { items, styles: {}, lang: "en" };
}

describe("extractPdfParagraphs", () => {
  it("groups wrapped lines and splits a paragraph at a large vertical gap", () => {
    const paragraphs = extractPdfParagraphs(
      content([
        item("This is a", 50, 700, 150),
        item("wrapped line.", 50, 684, 150),
        item("A new paragraph.", 50, 650, 170),
      ]),
      viewport,
    );

    expect(paragraphs.map(({ text }) => text)).toEqual([
      "This is a wrapped line.",
      "A new paragraph.",
    ]);
    expect(paragraphs[0]).toMatchObject({
      bbox: { x: 50, y: 88, width: 150, height: 28 },
      fontSize: 12,
      lineCount: 2,
    });
  });

  it("uses a line-ending sentence and extra leading as a paragraph break", () => {
    const paragraphs = extractPdfParagraphs(
      content([
        item("First sentence.", 50, 700, 150),
        item("Second paragraph.", 70, 683, 170),
      ]),
      viewport,
    );

    expect(paragraphs.map(({ text }) => text)).toEqual([
      "First sentence.",
      "Second paragraph.",
    ]);
  });

  it("orders a two-column page by column instead of alternating rows", () => {
    const paragraphs = extractPdfParagraphs(
      content([
        item("Article title", 50, 760, 500, { size: 18 }),
        item("Left line one", 50, 700, 200),
        item("Right line one", 340, 700, 210),
        item("left line two.", 50, 684, 200),
        item("right line two.", 340, 684, 210),
      ]),
      viewport,
    );

    expect(paragraphs.map(({ text }) => text)).toEqual([
      "Article title",
      "Left line one left line two.",
      "Right line one right line two.",
    ]);
  });

  it("joins split words and ignores marked-content records", () => {
    const paragraphs = extractPdfParagraphs(
      {
        ...content([
          item("inter-", 50, 700, 70),
          item("national", 50, 684, 90),
        ]),
        items: [
          { type: "beginMarkedContent", id: "tag" },
          ...content([
            item("inter-", 50, 700, 70),
            item("national", 50, 684, 90),
          ]).items,
        ],
      },
      viewport,
    );

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.text).toBe("international");
  });
});
