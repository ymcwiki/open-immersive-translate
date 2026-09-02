import type { TranslationContext } from "../../shared/types";

function firstWords(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || limit <= 0) return "";

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    const segments = [...segmenter.segment(normalized)];
    let words = 0;
    let end = 0;
    for (const segment of segments) {
      end = segment.index + segment.segment.length;
      if (segment.isWordLike && ++words >= limit) break;
    }
    return normalized.slice(0, end).trim();
  }

  return normalized.split(" ").slice(0, limit).join(" ");
}

/** Build stable prompt context from title and the first N source words. */
export function buildPageContext(
  doc: Document,
  sourceTexts: readonly string[],
  wordLimit = 80,
): TranslationContext {
  const title = doc.title.trim();
  const summary = firstWords(sourceTexts.join(" "), wordLimit);
  return {
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
  };
}
