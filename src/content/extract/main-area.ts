const EXCLUDED_ANCESTORS = "nav, aside, footer, [role='navigation'], [aria-hidden='true']";
const CANDIDATE_SELECTOR = "article, main, [role='main'], section, div";
const EXPLICIT_SELECTOR = "article, main, [role='main']";

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function linkTextLength(element: Element): number {
  return Array.from(element.querySelectorAll("a"), (link) => normalizedText(link).length)
    .reduce((sum, length) => sum + length, 0);
}

/** Score prose volume while penalizing link-heavy and deeply nested chrome. */
export function mainContentScore(element: Element): number {
  if (element.matches(EXCLUDED_ANCESTORS) || element.closest(EXCLUDED_ANCESTORS)) {
    return 0;
  }
  const prose = element.cloneNode(true) as Element;
  for (const excluded of prose.querySelectorAll(EXCLUDED_ANCESTORS)) excluded.remove();
  const textLength = normalizedText(prose).length;
  if (textLength < 40) return 0;
  const linkRatio = Math.min(1, linkTextLength(prose) / textLength);
  const descendants = prose.querySelectorAll("*").length;
  const paragraphs = prose.querySelectorAll("p, li, blockquote, h1, h2, h3").length;
  const semanticBonus = element.matches(EXPLICIT_SELECTOR) ? 1.8 : 1;
  return (
    (textLength * Math.max(0.08, 1 - linkRatio) * semanticBonus * (1 + Math.log2(paragraphs + 1))) /
    Math.sqrt(descendants + 1)
  );
}

/** Find the most likely page-prose container. */
export function findMainContent(root: Document | Element): Element | null {
  const scope = root instanceof Document ? root.body : root;
  if (!scope) return null;

  const candidates = [
    ...(scope.matches(CANDIDATE_SELECTOR) ? [scope] : []),
    ...scope.querySelectorAll(CANDIDATE_SELECTOR),
  ];
  let best: Element | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = mainContentScore(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
