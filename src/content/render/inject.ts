import type { Paragraph, Rule, TranslationMode } from "../../shared/types";

import themeCss from "./themes.css?raw";

export type TranslationTheme =
  | "none"
  | "underline"
  | "dashed"
  | "dotted"
  | "highlight"
  | "mask"
  | "opacity"
  | "blockquote"
  | "paper"
  | "bold"
  | "italic"
  | "grey"
  | "dividingLine"
  | "wavy"
  | "marker";

export interface RenderTranslationOptions {
  mode: TranslationMode;
  theme: string;
  wrapperTag: "font";
  prefix: "smart" | "block" | "inline";
}

interface SourceElementState {
  element: Element;
  wasHidden: boolean;
  hadClassAttribute: boolean;
}

interface SourceTextState {
  node: Text;
  wrapper: HTMLSpanElement;
}

interface RenderState {
  paragraph: Paragraph;
  injected: Element[];
  sourceElements: SourceElementState[];
  sourceTexts: SourceTextState[];
}

interface AdoptedStyleState {
  kind: "sheet";
  sheet: CSSStyleSheet;
}

interface ElementStyleState {
  kind: "element";
  element: HTMLStyleElement;
}

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "BR",
  "BUTTON",
  "CANVAS",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HGROUP",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "NOSCRIPT",
  "OL",
  "OPTION",
  "P",
  "PICTURE",
  "PRE",
  "SECTION",
  "SELECT",
  "SOURCE",
  "SUMMARY",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "TR",
  "UL",
  "VIDEO",
]);

const BLOCK_DISPLAYS = new Set([
  "block",
  "flex",
  "flow-root",
  "grid",
  "list-item",
  "table",
  "table-caption",
  "table-cell",
  "table-footer-group",
  "table-header-group",
  "table-row",
  "table-row-group",
]);

const states = new Set<RenderState>();
const statesByContainer = new WeakMap<Element, RenderState>();
const styleStates = new WeakMap<
  Document | ShadowRoot,
  AdoptedStyleState | ElementStyleState
>();

function belongsToRoot(root: Node, element: Element): boolean {
  return root === element || root.contains(element);
}

function isBlockContainer(container: Element): boolean {
  const display =
    container.ownerDocument.defaultView?.getComputedStyle(container).display;
  return BLOCK_TAGS.has(container.tagName) || BLOCK_DISPLAYS.has(display ?? "");
}

function appendTarget(
  paragraph: Paragraph,
  target: HTMLElement,
  prefix: RenderTranslationOptions["prefix"],
  state: RenderState,
): void {
  const useBlockPrefix =
    prefix === "block" ||
    (prefix === "smart" && isBlockContainer(paragraph.container));
  if (useBlockPrefix) {
    const lineBreak = paragraph.container.ownerDocument.createElement("br");
    lineBreak.dataset.imt = "br";
    paragraph.container.append(lineBreak);
    state.injected.push(lineBreak);
  }

  paragraph.container.append(target);
  state.injected.push(target);
}

function newState(paragraph: Paragraph): RenderState {
  removeTranslation(paragraph);
  const state: RenderState = {
    paragraph,
    injected: [],
    sourceElements: [],
    sourceTexts: [],
  };
  states.add(state);
  statesByContainer.set(paragraph.container, state);
  return state;
}

function topLevelSourceNodes(nodes: readonly Node[]): Node[] {
  const unique = [...new Set(nodes)];
  return unique.filter(
    (node) =>
      !unique.some(
        (candidate) =>
          candidate !== node &&
          candidate.nodeType === Node.ELEMENT_NODE &&
          candidate.contains(node),
      ),
  );
}

function ensureSourceMarkers(state: RenderState): void {
  if (state.sourceElements.length > 0 || state.sourceTexts.length > 0) {
    return;
  }

  for (const node of topLevelSourceNodes(state.paragraph.nodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      state.sourceElements.push({
        element,
        wasHidden: element.classList.contains("imt-source-hidden"),
        hadClassAttribute: element.hasAttribute("class"),
      });
      continue;
    }

    if (node.nodeType !== Node.TEXT_NODE || !node.parentNode) {
      continue;
    }

    const text = node as Text;
    const parent = text.parentNode;
    if (!parent) {
      continue;
    }
    const wrapper = text.ownerDocument.createElement("span");
    wrapper.dataset.imt = "source";
    parent.insertBefore(wrapper, text);
    wrapper.append(text);
    state.sourceTexts.push({ node: text, wrapper });
  }
}

function applyMode(state: RenderState, mode: TranslationMode): void {
  if (mode === "translation") {
    ensureSourceMarkers(state);
  }

  for (const { element, wasHidden } of state.sourceElements) {
    element.classList.toggle(
      "imt-source-hidden",
      mode === "translation" || wasHidden,
    );
  }
  for (const { wrapper } of state.sourceTexts) {
    wrapper.classList.toggle("imt-source-hidden", mode === "translation");
  }
}

function clearState(state: RenderState): void {
  for (const element of state.injected) {
    element.remove();
  }
  for (const {
    element,
    wasHidden,
    hadClassAttribute,
  } of state.sourceElements) {
    if (!wasHidden) {
      element.classList.remove("imt-source-hidden");
      if (!hadClassAttribute && element.getAttribute("class") === "") {
        element.removeAttribute("class");
      }
    }
  }
  for (const { node, wrapper } of state.sourceTexts) {
    if (wrapper.parentNode) {
      wrapper.parentNode.insertBefore(node, wrapper);
      wrapper.remove();
    }
  }

  state.paragraph.container.removeAttribute("data-imt-id");
  states.delete(state);
  statesByContainer.delete(state.paragraph.container);
}

function createTarget(paragraph: Paragraph, dataImt: string): HTMLElement {
  const target = paragraph.container.ownerDocument.createElement("font");
  target.classList.add("imt-target");
  target.dataset.imt = dataImt;
  return target;
}

/** Insert a translated fragment at the end of its paragraph container. */
export function renderTranslation(
  paragraph: Paragraph,
  fragment: DocumentFragment,
  options: RenderTranslationOptions,
): HTMLElement {
  const state = newState(paragraph);
  const target = paragraph.container.ownerDocument.createElement(
    options.wrapperTag,
  );
  target.classList.add("imt-target", `imt-theme-${options.theme}`);
  target.dataset.imt = "target";
  target.append(fragment);
  appendTarget(paragraph, target, options.prefix, state);
  applyMode(state, options.mode);
  return target;
}

/** Replace the current result with a loading indicator. */
export function setLoading(paragraph: Paragraph): void {
  const state = newState(paragraph);
  const target = createTarget(paragraph, "loading");
  target.classList.add("imt-loading");
  target.setAttribute("aria-label", "Translating");
  appendTarget(paragraph, target, "smart", state);
}

/** Replace the current result with an error message and retry button. */
export function setError(
  paragraph: Paragraph,
  message: string,
  retry: () => void,
): void {
  const state = newState(paragraph);
  const target = createTarget(paragraph, "error");
  target.classList.add("imt-error");
  target.append(`${message} `);

  const retryButton = paragraph.container.ownerDocument.createElement("button");
  retryButton.type = "button";
  retryButton.className = "imt-retry";
  retryButton.dataset.imt = "retry";
  retryButton.title = "Retry";
  retryButton.setAttribute("aria-label", "Retry translation");
  retryButton.textContent = "↻";
  retryButton.addEventListener("click", retry);
  target.append(retryButton);
  appendTarget(paragraph, target, "smart", state);
}

/** Remove the rendered state for one paragraph and restore its source DOM. */
export function removeTranslation(paragraph: Paragraph): void {
  const state = statesByContainer.get(paragraph.container);
  if (state) {
    clearState(state);
  } else {
    paragraph.container.removeAttribute("data-imt-id");
  }
}

function queryElements(
  root: Document | ShadowRoot | Element,
  selector: string,
): Element[] {
  const matches =
    root instanceof Element && root.matches(selector) ? [root] : [];
  return [...matches, ...root.querySelectorAll(selector)];
}

function removeInjectedStyles(root: Document | ShadowRoot): void {
  const styleState = styleStates.get(root);
  if (!styleState) {
    return;
  }
  if (styleState.kind === "sheet") {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
      (sheet) => sheet !== styleState.sheet,
    );
  } else {
    styleState.element.remove();
  }
  styleStates.delete(root);
}

/** Remove every rendered translation below a root and restore source nodes. */
export function removeAll(root: Document | ShadowRoot | Element): void {
  for (const state of [...states]) {
    if (belongsToRoot(root, state.paragraph.container)) {
      clearState(state);
    }
  }

  for (const wrapper of queryElements(root, '[data-imt="source"]')) {
    wrapper.replaceWith(...wrapper.childNodes);
  }
  for (const element of queryElements(
    root,
    '[data-imt="target"], [data-imt="loading"], [data-imt="error"], [data-imt="br"]',
  )) {
    element.remove();
  }
  for (const element of queryElements(root, "[data-imt-id]")) {
    element.removeAttribute("data-imt-id");
  }

  if (root instanceof Document || root instanceof ShadowRoot) {
    removeInjectedStyles(root);
  }
}

/** Switch rendered paragraphs below a root between dual and translation-only mode. */
export function setMode(
  root: Document | ShadowRoot | Element,
  mode: TranslationMode,
): void {
  for (const state of states) {
    if (belongsToRoot(root, state.paragraph.container)) {
      applyMode(state, mode);
    }
  }
}

/** Store the paragraph id on its source container. */
export function markTranslated(container: Element, id: string): void {
  container.setAttribute("data-imt-id", id);
}

/** Report whether a source container has a translation marker. */
export function isTranslated(container: Element): boolean {
  return container.hasAttribute("data-imt-id");
}

/** Inject base themes and optional site CSS into a document or shadow root. */
export function injectStyles(
  root: Document | ShadowRoot,
  extraCss: readonly string[] = [],
): void {
  const css = [themeCss, ...extraCss].join("\n");
  const current = styleStates.get(root);
  if (current?.kind === "sheet") {
    current.sheet.replaceSync(css);
    return;
  }
  if (current?.kind === "element") {
    current.element.textContent = css;
    return;
  }

  const view =
    root instanceof Document
      ? root.defaultView
      : root.ownerDocument.defaultView;
  const StyleSheet = view?.CSSStyleSheet;
  const canAdopt =
    "adoptedStyleSheets" in root &&
    typeof StyleSheet === "function" &&
    typeof StyleSheet.prototype.replaceSync === "function";

  if (canAdopt && StyleSheet) {
    const sheet = new StyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    styleStates.set(root, { kind: "sheet", sheet });
    return;
  }

  const document = root instanceof Document ? root : root.ownerDocument;
  const style = document.createElement("style");
  style.dataset.imt = "style";
  style.textContent = css;
  if (root instanceof Document) {
    (root.head ?? root.documentElement).append(style);
  } else {
    root.append(style);
  }
  styleStates.set(root, { kind: "element", element: style });
}

/** Phase-0 adapter for callers that still pass plain text and a rule. */
export function injectTranslation(
  paragraph: Paragraph,
  translatedText: string,
  rule: Rule,
): HTMLElement {
  const fragment = paragraph.container.ownerDocument.createDocumentFragment();
  fragment.append(translatedText);
  const prefix =
    rule.wrapperPrefix === "block" || rule.wrapperPrefix === "inline"
      ? rule.wrapperPrefix
      : "smart";

  return renderTranslation(paragraph, fragment, {
    mode: rule.translationMode ?? "dual",
    theme: rule.theme ?? "none",
    wrapperTag: "font",
    prefix,
  });
}
