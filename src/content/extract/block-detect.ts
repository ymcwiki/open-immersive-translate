import type { Rule } from "../../shared/types";

/** Decide whether an element is a block boundary under a merged rule. */
export function isBlockElement(element: Element, rule: Rule): boolean {
  // TODO(phase1:extract): Combine tag, selector, and computed-style checks.
  void element;
  void rule;
  throw new Error("NotImplemented");
}
