import type { Rule } from "../../shared/types";

const BLOCK_DISPLAYS = new Set([
  "block",
  "flex",
  "grid",
  "list-item",
  "table-cell",
]);

function matchesAny(element: Element, selectors: readonly string[]): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

/** Decide whether an element is a block boundary under a merged rule. */
export function isBlockElement(element: Element, rule: Rule): boolean {
  if (matchesAny(element, rule.extraInlineSelectors ?? [])) return false;
  if (matchesAny(element, rule.extraBlockSelectors ?? [])) return true;

  const blockTags = new Set(
    (rule.allBlockTags ?? []).map((tag) => tag.toUpperCase()),
  );
  if (blockTags.has(element.tagName.toUpperCase())) return true;

  try {
    const display = element.ownerDocument.defaultView
      ?.getComputedStyle(element)
      .display.toLowerCase();
    return display ? BLOCK_DISPLAYS.has(display) : false;
  } catch {
    return false;
  }
}
