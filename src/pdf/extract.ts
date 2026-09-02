import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import type { PageViewport } from "pdfjs-dist/types/src/display/page_viewport";

import type { PdfBoundingBox, PdfParagraph } from "./types";

type TextContentInput = Pick<TextContent, "items">;
type ViewportInput = Pick<
  PageViewport,
  "width" | "height" | "scale" | "convertToViewportPoint"
>;

interface PositionedTextItem {
  text: string;
  bbox: PdfBoundingBox;
  baseline: number;
  fontSize: number;
  hasEOL: boolean;
}

interface PdfLine extends PdfParagraph {
  hasEOL: boolean;
}

interface ColumnCluster {
  lines: PdfLine[];
  minX: number;
  maxX: number;
}

const SENTENCE_END = /[.!?。！？:：;；][”’」』】）)]?$/u;
const NO_SPACE_BEFORE = /^[,.;:!?，。！？：；、)}\]」』】]/u;
const NO_SPACE_AFTER = /[([（【「『]$/u;
const CJK_EDGE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const CJK_START = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Convert PDF.js text items into reading-ordered paragraph boxes. */
export function extractPdfParagraphs(
  textContent: TextContentInput,
  viewport: ViewportInput,
): PdfParagraph[] {
  const items = textContent.items.flatMap((item) =>
    isTextItem(item) && item.str.trim() ? [positionItem(item, viewport)] : [],
  );
  if (!items.length) return [];

  const lines = buildLines(items, viewport.width);
  const columns = detectColumns(lines, viewport.width);
  if (!columns) return mergeParagraphLines(lines);

  const [left, right] = columns;
  const split = (left.maxX + right.minX) / 2;
  const spanning = lines.filter(
    (line) =>
      line.bbox.width > viewport.width * 0.62 ||
      (line.bbox.x < split && line.bbox.x + line.bbox.width > split),
  );
  const columnLines = lines.filter((line) => !spanning.includes(line));
  const ordered: PdfParagraph[] = [];
  let bandTop = -Infinity;

  for (const divider of [...spanning].sort(byTop)) {
    ordered.push(
      ...mergeBand(columnLines, split, bandTop, divider.bbox.y),
      ...mergeParagraphLines([divider]),
    );
    bandTop = divider.bbox.y + divider.bbox.height;
  }
  ordered.push(...mergeBand(columnLines, split, bandTop, Infinity));
  return ordered;
}

function isTextItem(value: TextContent["items"][number]): value is TextItem {
  return "str" in value && Array.isArray(value.transform);
}

function positionItem(
  item: TextItem,
  viewport: ViewportInput,
): PositionedTextItem {
  const [x1, y1] = viewport.convertToViewportPoint(
    Number(item.transform[4]),
    Number(item.transform[5]),
  );
  const [x2, y2] = viewport.convertToViewportPoint(
    Number(item.transform[4]) + item.width,
    Number(item.transform[5]) + Math.max(item.height, 1),
  );
  const transformFontSize = Math.hypot(
    Number(item.transform[2]),
    Number(item.transform[3]),
  );
  const fontSize = Math.max(
    1,
    transformFontSize * viewport.scale,
    Math.abs(y2 - y1),
  );

  return {
    text: item.str,
    bbox: {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.max(Math.abs(x2 - x1), 1),
      height: fontSize,
    },
    baseline: y1,
    fontSize,
    hasEOL: item.hasEOL,
  };
}

function buildLines(items: PositionedTextItem[], pageWidth: number): PdfLine[] {
  const rows: PositionedTextItem[][] = [];
  for (const item of [...items].sort((a, b) =>
    a.baseline === b.baseline ? a.bbox.x - b.bbox.x : a.baseline - b.baseline,
  )) {
    const row = rows.find((candidate) => {
      const anchor = candidate[0];
      return (
        anchor !== undefined &&
        Math.abs(anchor.baseline - item.baseline) <=
          Math.max(2, Math.min(anchor.fontSize, item.fontSize) * 0.35)
      );
    });
    if (row) row.push(item);
    else rows.push([item]);
  }

  return rows.flatMap((row) => splitRow(row, pageWidth)).sort(byTop);
}

function splitRow(row: PositionedTextItem[], pageWidth: number): PdfLine[] {
  const segments: PositionedTextItem[][] = [];
  let segment: PositionedTextItem[] = [];
  let right = -Infinity;

  for (const item of [...row].sort((a, b) => a.bbox.x - b.bbox.x)) {
    const gap = item.bbox.x - right;
    const typicalFont = segment.at(-1)?.fontSize ?? item.fontSize;
    if (
      segment.length &&
      gap > Math.max(typicalFont * 3.5, pageWidth * 0.055)
    ) {
      segments.push(segment);
      segment = [];
      right = -Infinity;
    }
    segment.push(item);
    right = Math.max(right, item.bbox.x + item.bbox.width);
  }
  if (segment.length) segments.push(segment);

  return segments.map(lineFromItems);
}

function lineFromItems(items: PositionedTextItem[]): PdfLine {
  const sorted = [...items].sort((a, b) => a.bbox.x - b.bbox.x);
  let text = "";
  let previous: PositionedTextItem | undefined;
  for (const item of sorted) {
    if (previous && needsItemSpace(previous, item)) text += " ";
    text += item.text;
    previous = item;
  }
  const bbox = unionBoxes(sorted.map((item) => item.bbox));
  return {
    text: normalizeSpaces(text),
    bbox,
    fontSize: median(sorted.map((item) => item.fontSize)),
    lineCount: 1,
    hasEOL: sorted.some((item) => item.hasEOL),
  };
}

function needsItemSpace(
  previous: PositionedTextItem,
  current: PositionedTextItem,
): boolean {
  if (/\s$/u.test(previous.text) || /^\s/u.test(current.text)) return false;
  if (
    NO_SPACE_BEFORE.test(current.text) ||
    NO_SPACE_AFTER.test(previous.text)
  ) {
    return false;
  }
  if (CJK_EDGE.test(previous.text) && CJK_START.test(current.text))
    return false;
  const gap = current.bbox.x - (previous.bbox.x + previous.bbox.width);
  return gap > Math.min(previous.fontSize, current.fontSize) * 0.12;
}

function detectColumns(
  lines: PdfLine[],
  pageWidth: number,
): [ColumnCluster, ColumnCluster] | undefined {
  const candidates = lines.filter(
    (line) =>
      line.bbox.width < pageWidth * 0.62 && line.bbox.width > pageWidth * 0.08,
  );
  if (candidates.length < 4) return undefined;

  let low = Math.min(...candidates.map(centerX));
  let high = Math.max(...candidates.map(centerX));
  if (high - low < pageWidth * 0.2) return undefined;

  let leftLines: PdfLine[] = [];
  let rightLines: PdfLine[] = [];
  for (let iteration = 0; iteration < 8; iteration += 1) {
    leftLines = [];
    rightLines = [];
    for (const line of candidates) {
      (Math.abs(centerX(line) - low) <= Math.abs(centerX(line) - high)
        ? leftLines
        : rightLines
      ).push(line);
    }
    if (!leftLines.length || !rightLines.length) return undefined;
    low = average(leftLines.map(centerX));
    high = average(rightLines.map(centerX));
  }

  if (low > high) [leftLines, rightLines] = [rightLines, leftLines];
  const left = cluster(leftLines);
  const right = cluster(rightLines);
  if (
    left.lines.length < 2 ||
    right.lines.length < 2 ||
    right.minX - left.maxX < pageWidth * 0.035
  ) {
    return undefined;
  }
  return [left, right];
}

function cluster(lines: PdfLine[]): ColumnCluster {
  return {
    lines,
    minX: Math.min(...lines.map((line) => line.bbox.x)),
    maxX: Math.max(...lines.map((line) => line.bbox.x + line.bbox.width)),
  };
}

function mergeBand(
  lines: PdfLine[],
  split: number,
  top: number,
  bottom: number,
): PdfParagraph[] {
  const inBand = lines.filter(
    (line) => line.bbox.y >= top && line.bbox.y < bottom,
  );
  return [
    ...mergeParagraphLines(inBand.filter((line) => centerX(line) < split)),
    ...mergeParagraphLines(inBand.filter((line) => centerX(line) >= split)),
  ];
}

function mergeParagraphLines(input: PdfLine[]): PdfParagraph[] {
  const lines = [...input].sort(byTop);
  if (!lines.length) return [];
  const columnX = Math.min(...lines.map((line) => line.bbox.x));
  const groups: PdfLine[][] = [];
  let group: PdfLine[] = [];

  for (const line of lines) {
    const previous = group.at(-1);
    if (previous && startsParagraph(previous, line, columnX)) {
      groups.push(group);
      group = [];
    }
    group.push(line);
  }
  if (group.length) groups.push(group);

  return groups.map((paragraphLines) => {
    let text = "";
    for (const line of paragraphLines) text = joinLineText(text, line.text);
    return {
      text,
      bbox: unionBoxes(paragraphLines.map((line) => line.bbox)),
      fontSize: median(paragraphLines.map((line) => line.fontSize)),
      lineCount: paragraphLines.length,
    };
  });
}

function startsParagraph(
  previous: PdfLine,
  next: PdfLine,
  columnX: number,
): boolean {
  const size = Math.max(previous.fontSize, next.fontSize);
  const verticalGap = next.bbox.y - (previous.bbox.y + previous.bbox.height);
  const fontRatio =
    Math.max(previous.fontSize, next.fontSize) /
    Math.max(1, Math.min(previous.fontSize, next.fontSize));
  const indented = next.bbox.x - columnX > size * 1.2;

  return (
    verticalGap > size * 0.85 ||
    fontRatio > 1.35 ||
    (SENTENCE_END.test(previous.text) && verticalGap > size * 0.38) ||
    (indented && (SENTENCE_END.test(previous.text) || previous.hasEOL))
  );
}

function joinLineText(previous: string, next: string): string {
  if (!previous) return next;
  if (previous.endsWith("-") && /^[\p{L}\p{N}]/u.test(next)) {
    return `${previous.slice(0, -1)}${next}`;
  }
  if (
    NO_SPACE_BEFORE.test(next) ||
    NO_SPACE_AFTER.test(previous) ||
    (CJK_EDGE.test(previous) && CJK_START.test(next))
  ) {
    return previous + next;
  }
  return `${previous} ${next}`;
}

function unionBoxes(boxes: PdfBoundingBox[]): PdfBoundingBox {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function centerX(line: PdfLine): number {
  return line.bbox.x + line.bbox.width / 2;
}

function byTop(a: PdfLine, b: PdfLine): number {
  return a.bbox.y === b.bbox.y ? a.bbox.x - b.bbox.x : a.bbox.y - b.bbox.y;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 1)
    : ((sorted[middle - 1] ?? 1) + (sorted[middle] ?? 1)) / 2;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
