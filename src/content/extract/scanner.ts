import type { Paragraph, Rule } from "../../shared/types";
import type {
  AdvancedPageRule,
  AdvancedParagraph,
} from "../../shared/j-types";
import { isBlockElement } from "./block-detect";
import { encode } from "./placeholder";
import { isPreLikeElement } from "./pre-like";

const DEFAULT_PLACEHOLDER_STYLE = { open: "{", close: "}" } as const;

type CheckVisibilityElement = Element & {
  checkVisibility?: (options?: {
    checkOpacity?: boolean;
    checkVisibilityCSS?: boolean;
  }) => boolean;
};

function matchesAny(element: Element, selectors: readonly string[]): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

function hasTag(element: Element, tags: readonly string[]): boolean {
  const tagName = element.tagName.toUpperCase();
  return tags.some((tag) => tag.toUpperCase() === tagName);
}

function isVisible(element: Element): boolean {
  const checkVisibility = (element as CheckVisibilityElement).checkVisibility;
  if (typeof checkVisibility === "function") {
    try {
      if (
        !checkVisibility.call(element, {
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      ) {
        return false;
      }
    } catch {
      // Older browsers and jsdom use the computed-style fallback below.
    }
  }

  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute("hidden")) return false;

    const inlineStyle = (current as HTMLElement).style;
    if (
      inlineStyle?.display === "none" ||
      inlineStyle?.visibility === "hidden" ||
      inlineStyle?.visibility === "collapse" ||
      inlineStyle?.opacity === "0" ||
      inlineStyle?.contentVisibility === "hidden"
    ) {
      return false;
    }

    try {
      const style =
        current.ownerDocument.defaultView?.getComputedStyle(current);
      if (
        style?.display === "none" ||
        style?.visibility === "hidden" ||
        style?.visibility === "collapse" ||
        style?.opacity === "0" ||
        style?.contentVisibility === "hidden"
      ) {
        return false;
      }
    } catch {
      // A detached jsdom node may not have a usable Window.
    }

    current = current.parentElement;
  }

  return true;
}

function shouldSkipElement(element: Element, rule: Rule): boolean {
  if (!isVisible(element)) return true;

  let current: Element | null = element;
  while (current) {
    const translate = current.getAttribute("translate")?.toLowerCase();
    if (
      current.tagName.toUpperCase() === "IFRAME" ||
      hasTag(current, rule.excludeTags ?? []) ||
      matchesAny(current, rule.excludeSelectors ?? []) ||
      current.hasAttribute("contenteditable") ||
      translate === "no" ||
      current.classList.contains("notranslate") ||
      current.hasAttribute("data-imt")
    ) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function isStayOriginal(element: Element, rule: Rule): boolean {
  return (
    hasTag(element, rule.stayOriginalTags ?? []) ||
    matchesAny(element, rule.stayOriginalSelectors ?? [])
  );
}

function isAtomic(element: Element, rule: Rule): boolean {
  return matchesAny(element, rule.atomicBlockSelectors ?? []);
}

function isBreak(node: Node): boolean {
  return node.nodeType === 1 && (node as Element).tagName === "BR";
}

function plainText(nodes: readonly Node[], rule: Rule): string {
  const read = (node: Node): string => {
    if (node.nodeType === 3) return node.nodeValue ?? "";
    if (node.nodeType !== 1 && node.nodeType !== 11) return "";
    if (node.nodeType === 11) {
      return Array.from(node.childNodes, read).join("");
    }

    const element = node as Element;
    if (shouldSkipElement(element, rule) || isStayOriginal(element, rule)) {
      return "";
    }
    if (element.tagName === "BR") return "\n";
    return Array.from(element.childNodes, read).join("");
  };

  return nodes.map(read).join("");
}

function elementPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);

    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    const root = current.getRootNode();
    if (root.nodeType === 11 && "host" in root) {
      parts.unshift("#shadow-root");
      current = (root as ShadowRoot).host;
    } else {
      current = null;
    }
  }

  return parts.join(">");
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function selectorRoots(root: Node, selectors: readonly string[]): Element[] {
  if (!selectors.length) return [];

  const candidates: Element[] = [];
  if (root.nodeType === 1 && matchesAny(root as Element, selectors)) {
    candidates.push(root as Element);
  }

  if ("querySelectorAll" in root) {
    for (const selector of selectors) {
      try {
        candidates.push(
          ...Array.from((root as ParentNode).querySelectorAll(selector)),
        );
      } catch {
        // Invalid user selectors match nothing.
      }
    }
  }

  const unique = Array.from(new Set(candidates));
  return unique.filter(
    (candidate) =>
      !unique.some((other) => other !== candidate && other.contains(candidate)),
  );
}

function splitAtBreaks(nodes: readonly Node[]): Node[][] {
  const groups: Node[][] = [[]];
  for (const node of nodes) {
    if (isBreak(node)) {
      groups.push([]);
    } else {
      groups.at(-1)?.push(node);
    }
  }
  return groups;
}

/** Extract independently translatable paragraphs from a DOM subtree. */
export function extractParagraphs(root: Node, rule: Rule): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const idCounts = new Map<string, number>();
  const minimumLength = rule.paragraphMinTextCount ?? 2;
  const advancedRule = rule as AdvancedPageRule;

  const paragraphId = (container: Element, text: string): string => {
    const baseId = `imt-${stableHash(`${elementPath(container)}\0${text}`)}`;
    const occurrence = (idCounts.get(baseId) ?? 0) + 1;
    idCounts.set(baseId, occurrence);
    return occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
  };

  const addParagraph = (container: Element, nodes: readonly Node[]): void => {
    const sourceText = plainText(nodes, rule).trim();
    if (sourceText.length < minimumLength) return;

    const encoded = encode(
      nodes,
      DEFAULT_PLACEHOLDER_STYLE,
      (element) => isStayOriginal(element, rule),
      (element) => shouldSkipElement(element, rule),
    );
    const text = encoded.text.trim();
    if (!text) return;

    paragraphs.push({
      id: paragraphId(container, text),
      container,
      nodes: [...nodes],
      text,
      placeholders: encoded.placeholders,
    });
  };

  const emitPreLike = (element: Element): void => {
    const text = element.textContent ?? "";
    if (text.trim().length < minimumLength) return;
    const paragraph: AdvancedParagraph = {
      id: paragraphId(element, text),
      container: element,
      nodes: [...element.childNodes],
      text,
      placeholders: new Map(),
      preformatted: true,
    };
    paragraphs.push(paragraph);
  };

  const emitRun = (container: Element, nodes: readonly Node[]): void => {
    if (!nodes.length) return;

    const totalLength = plainText(nodes, rule).trim().length;
    const breakLimit = rule.lineBreakMaxTextCount ?? 0;
    const groups =
      nodes.some(isBreak) && totalLength > breakLimit
        ? splitAtBreaks(nodes)
        : [Array.from(nodes)];

    for (const group of groups) addParagraph(container, group);
  };

  const emitAtomic = (element: Element): void => {
    addParagraph(element, Array.from(element.childNodes));
  };

  const emitNavigationRun = (
    container: Element,
    nodes: readonly Node[],
  ): boolean => {
    const isNavigation =
      container.tagName === "NAV" ||
      container.getAttribute("role")?.toLowerCase() === "navigation";
    if (!isNavigation) return false;

    const items = nodes.filter(
      (node): node is Element =>
        node.nodeType === 1 &&
        ["A", "BUTTON"].includes((node as Element).tagName),
    );
    if (items.length < 3) return false;

    for (const item of items) {
      addParagraph(item, Array.from(item.childNodes));
    }
    return true;
  };

  const visitChildren = (parent: ParentNode, container: Element): void => {
    let run: Node[] = [];
    const flush = (): void => {
      if (!emitNavigationRun(container, run)) emitRun(container, run);
      run = [];
    };

    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3) {
        run.push(child);
        continue;
      }
      if (child.nodeType !== 1) continue;

      const element = child as Element;
      if (isPreLikeElement(element, advancedRule)) {
        flush();
        emitPreLike(element);
        continue;
      }
      if (shouldSkipElement(element, rule)) continue;
      if (isBreak(element) || isStayOriginal(element, rule)) {
        run.push(element);
        continue;
      }
      if (isAtomic(element, rule)) {
        flush();
        emitAtomic(element);
        continue;
      }
      if (
        element.shadowRoot &&
        matchesAny(element, rule.shadowRootSelectors ?? [])
      ) {
        flush();
        visitElement(element);
        continue;
      }
      if (isBlockElement(element, rule)) {
        flush();
        visitElement(element);
        continue;
      }

      run.push(element);
    }
    flush();
  };

  const visitShadowRoot = (element: Element): void => {
    if (
      element.shadowRoot &&
      matchesAny(element, rule.shadowRootSelectors ?? [])
    ) {
      visitChildren(element.shadowRoot, element);
    }
  };

  const visitElement = (element: Element): void => {
    if (isPreLikeElement(element, advancedRule)) {
      emitPreLike(element);
      return;
    }
    if (shouldSkipElement(element, rule)) return;
    if (isAtomic(element, rule)) {
      emitAtomic(element);
      return;
    }
    if (isStayOriginal(element, rule)) return;

    if (isBlockElement(element, rule)) {
      visitChildren(element, element);
    } else {
      addParagraph(element, Array.from(element.childNodes));
    }
    visitShadowRoot(element);
  };

  const selectedRoots = selectorRoots(root, rule.selectors ?? []);
  if (selectedRoots.length || (rule.selectors?.length ?? 0) > 0) {
    for (const selectedRoot of selectedRoots) visitElement(selectedRoot);
  } else if (root.nodeType === 9) {
    const doc = root as Document;
    if (rule.isTranslateTitle) {
      const title = extractTitle(doc, rule);
      if (title) paragraphs.push(title);
    }
    if (doc.body) visitElement(doc.body);
  } else if (root.nodeType === 1) {
    visitElement(root as Element);
  } else if (root.nodeType === 11) {
    const fragment = root as DocumentFragment;
    const container =
      "host" in fragment ? (fragment as ShadowRoot).host : undefined;
    if (container) {
      visitChildren(fragment, container);
    } else {
      for (const child of Array.from(fragment.children)) visitElement(child);
    }
  } else if (root.nodeType === 3 && root.parentElement) {
    addParagraph(root.parentElement, [root]);
  }

  return paragraphs;
}

/** Extract the document title when title translation is enabled. */
export function extractTitle(doc: Document, rule?: Rule): Paragraph | null {
  if (rule?.isTranslateTitle === false) return null;

  const container = doc.querySelector("title");
  const text = doc.title.trim();
  if (!container || text.length < (rule?.paragraphMinTextCount ?? 2)) {
    return null;
  }

  return {
    id: `imt-${stableHash(`${elementPath(container)}\0${text}`)}`,
    container,
    nodes: Array.from(container.childNodes),
    text,
    placeholders: new Map(),
  };
}

/** Phase-0 contract name retained for content bootstrap compatibility. */
export function scanParagraphs(root: ParentNode, rule: Rule): Paragraph[] {
  return extractParagraphs(root as Node, rule);
}
