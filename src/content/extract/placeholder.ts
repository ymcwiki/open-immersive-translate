import type { PlaceholderStyle } from "../../shared/types";

/** Result of encoding inline nodes into service-safe placeholders. */
export interface EncodedPlaceholders {
  text: string;
  placeholders: Map<string, Element>;
}

/** Encode rich inline nodes for translation. */
export function encodePlaceholders(
  nodes: readonly Node[],
  style: PlaceholderStyle,
): EncodedPlaceholders {
  // TODO(phase1:extract): Encode paired and self-closing inline elements.
  void nodes;
  void style;
  throw new Error("NotImplemented");
}

/** Decode translated placeholder text into cloned DOM nodes. */
export function decodePlaceholders(
  text: string,
  placeholders: ReadonlyMap<string, Element>,
  style: PlaceholderStyle,
): DocumentFragment {
  // TODO(phase1:extract): Restore placeholders and translated child content.
  void text;
  void placeholders;
  void style;
  throw new Error("NotImplemented");
}
