import type { PlaceholderStyle } from "../../shared/types";

/** Result of encoding inline nodes into service-safe placeholders. */
export interface EncodedPlaceholders {
  text: string;
  placeholders: Map<string, Element>;
}

const VOID_TAGS = new Set([
  "AREA",
  "BASE",
  "BR",
  "COL",
  "EMBED",
  "HR",
  "IMG",
  "INPUT",
  "LINK",
  "META",
  "PARAM",
  "SOURCE",
  "TRACK",
  "WBR",
]);

const DEFAULT_STAY_ORIGINAL_TAGS = new Set([
  "CODE",
  "IMG",
  "KBD",
  "MATH",
  "MFRAC",
  "MI",
  "MN",
  "MO",
  "MROW",
  "MSQRT",
  "MSUP",
  "SAMP",
  "SEMANTICS",
  "SUB",
  "SUP",
  "TT",
]);

type ElementPredicate = (element: Element) => boolean;
const encodedStandaloneElements = new WeakSet<Element>();

function assertStyle(style: PlaceholderStyle): void {
  if (!style.open || !style.close) {
    throw new TypeError("Placeholder delimiters must not be empty");
  }
}

function placeholderToken(id: string, style: PlaceholderStyle): string {
  return `${style.open}${id}${style.close}`;
}

function isDefaultStandalone(element: Element): boolean {
  const tag = element.tagName.toUpperCase();
  return VOID_TAGS.has(tag) || DEFAULT_STAY_ORIGINAL_TAGS.has(tag);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Encode rich inline nodes for translation. */
export function encode(
  nodes: readonly Node[],
  style: PlaceholderStyle,
  isStayOriginal: ElementPredicate = isDefaultStandalone,
  shouldSkip: ElementPredicate = () => false,
): EncodedPlaceholders {
  assertStyle(style);

  const placeholders = new Map<string, Element>();
  let nextId = 1;

  const encodeNode = (node: Node): string => {
    if (node.nodeType === 3) return node.nodeValue ?? "";

    if (node.nodeType === 1) {
      const element = node as Element;
      if (shouldSkip(element)) return "";

      const id = String(nextId++);
      placeholders.set(id, element);
      const opening = placeholderToken(id, style);
      if (isDefaultStandalone(element) || isStayOriginal(element)) {
        encodedStandaloneElements.add(element);
        return opening;
      }

      const content = Array.from(element.childNodes, encodeNode).join("");
      return `${opening}${content}${placeholderToken(`/${id}`, style)}`;
    }

    if (node.nodeType === 11) {
      return Array.from(node.childNodes, encodeNode).join("");
    }

    return "";
  };

  return {
    text: nodes.map(encodeNode).join(""),
    placeholders,
  };
}

interface DecodeFrame {
  id: string;
  element?: Element;
  parent: Node;
  ignored?: boolean;
}

function unwrapFrame(frame: DecodeFrame): void {
  if (!frame.element) return;
  while (frame.element.firstChild) {
    frame.parent.insertBefore(frame.element.firstChild, frame.element);
  }
  frame.element.remove();
}

/** Decode translated placeholder text into cloned DOM nodes. */
export function decode(
  text: string,
  placeholders: ReadonlyMap<string, Element>,
  style: PlaceholderStyle,
): DocumentFragment {
  assertStyle(style);

  const firstPlaceholder = placeholders.values().next().value as
    Element | undefined;
  const ownerDocument = firstPlaceholder?.ownerDocument ?? globalThis.document;
  if (!ownerDocument) {
    throw new Error("A document is required to decode placeholders");
  }

  const fragment = ownerDocument.createDocumentFragment();
  const frames: DecodeFrame[] = [];
  const used = new Set<string>();
  const matcher = new RegExp(
    `${escapeRegExp(style.open)}(\\/?\\d+)${escapeRegExp(style.close)}`,
    "g",
  );

  const currentParent = (): Node =>
    frames.at(-1)?.element ?? frames.at(-1)?.parent ?? fragment;
  const appendText = (value: string): void => {
    if (value) currentParent().appendChild(ownerDocument.createTextNode(value));
  };

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    appendText(text.slice(cursor, match.index));
    cursor = matcher.lastIndex;

    const reference = match[1];
    if (!reference) continue;

    if (reference.startsWith("/")) {
      const id = reference.slice(1);
      let frameIndex = -1;
      for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (frames[index]?.id === id) {
          frameIndex = index;
          break;
        }
      }

      if (frameIndex < 0) {
        if (placeholders.has(id)) {
          console.warn(`[imt] Dropped unmatched closing placeholder ${id}`);
        }
        continue;
      }

      while (frames.length - 1 > frameIndex) {
        const unmatched = frames.pop();
        if (!unmatched) break;
        if (!unmatched.ignored) {
          console.warn(
            `[imt] Dropped unmatched opening placeholder ${unmatched.id}`,
          );
        }
        unwrapFrame(unmatched);
      }
      frames.pop();
      continue;
    }

    const source = placeholders.get(reference);
    if (!source || used.has(reference)) {
      frames.push({ id: reference, parent: currentParent(), ignored: true });
      continue;
    }

    used.add(reference);
    if (isDefaultStandalone(source) || encodedStandaloneElements.has(source)) {
      currentParent().appendChild(source.cloneNode(true));
      continue;
    }

    const clone = source.cloneNode(false) as Element;
    const parent = currentParent();
    parent.appendChild(clone);
    frames.push({ id: reference, element: clone, parent });
  }
  appendText(text.slice(cursor));

  while (frames.length) {
    const unmatched = frames.pop();
    if (!unmatched) break;
    if (!unmatched.ignored && placeholders.has(unmatched.id)) {
      console.warn(
        `[imt] Dropped unmatched opening placeholder ${unmatched.id}`,
      );
    }
    unwrapFrame(unmatched);
  }

  for (const id of placeholders.keys()) {
    if (!used.has(id)) {
      console.warn(`[imt] Translation omitted placeholder ${id}`);
    }
  }

  return fragment;
}

/** Contract-compatible encoding name retained for other workstreams. */
export const encodePlaceholders = encode;

/** Contract-compatible decoding name retained for other workstreams. */
export const decodePlaceholders = decode;
