import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  injectStyles,
  isTranslated,
  markTranslated,
  removeAll,
  renderTranslation,
  setError,
  setLoading,
  setMode,
} from "../../src/content/render/inject";
import type { Paragraph } from "../../src/shared/types";

function makeParagraph(container: Element): Paragraph {
  return {
    id: "paragraph-1",
    container,
    nodes: [...container.childNodes],
    text: container.textContent ?? "",
    placeholders: new Map(),
  };
}

function translationFragment(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(text);
  return fragment;
}

afterEach(() => {
  removeAll(document);
  document.body.replaceChildren();
});

describe("renderTranslation", () => {
  it("inserts a dual translation after a block source", () => {
    document.body.innerHTML = "<p>Hello</p>";
    const container = document.querySelector("p")!;

    const target = renderTranslation(
      makeParagraph(container),
      translationFragment("你好"),
      {
        mode: "dual",
        theme: "underline",
        wrapperTag: "font",
        prefix: "smart",
      },
    );

    expect(container.childNodes[1]).toBeInstanceOf(HTMLBRElement);
    expect(container.childNodes[2]).toBe(target);
    expect(target.outerHTML).toBe(
      '<font class="imt-target imt-theme-underline" data-imt="target">你好</font>',
    );
    expect(container.textContent).toBe("Hello你好");
  });

  it("hides an inline source without adding a line break in translation-only mode", () => {
    document.body.innerHTML = "<span>Hello</span>";
    const container = document.querySelector("span")!;

    renderTranslation(makeParagraph(container), translationFragment("你好"), {
      mode: "translation",
      theme: "none",
      wrapperTag: "font",
      prefix: "smart",
    });

    expect(container.querySelector('[data-imt="br"]')).toBeNull();
    expect(
      container
        .querySelector('[data-imt="source"]')
        ?.classList.contains("imt-source-hidden"),
    ).toBe(true);
    expect(container.querySelector('[data-imt="target"]')?.textContent).toBe(
      "你好",
    );
  });

  it("honors explicit block and inline prefixes", () => {
    document.body.innerHTML = "<span id='block'>A</span><p id='inline'>B</p>";
    const block = document.querySelector("#block")!;
    const inline = document.querySelector("#inline")!;

    renderTranslation(makeParagraph(block), translationFragment("甲"), {
      mode: "dual",
      theme: "none",
      wrapperTag: "font",
      prefix: "block",
    });
    renderTranslation(makeParagraph(inline), translationFragment("乙"), {
      mode: "dual",
      theme: "none",
      wrapperTag: "font",
      prefix: "inline",
    });

    expect(block.querySelector('[data-imt="br"]')).not.toBeNull();
    expect(inline.querySelector('[data-imt="br"]')).toBeNull();
  });

  it("uses computed block display for smart prefixes", () => {
    document.body.innerHTML = "<span style='display: grid'>A</span>";
    const container = document.querySelector("span")!;

    renderTranslation(makeParagraph(container), translationFragment("甲"), {
      mode: "dual",
      theme: "none",
      wrapperTag: "font",
      prefix: "smart",
    });

    expect(container.querySelector('[data-imt="br"]')).not.toBeNull();
  });

  it("replaces loading, result, and error states and runs retry", () => {
    document.body.innerHTML = "<p>Hello</p>";
    const paragraph = makeParagraph(document.querySelector("p")!);
    const retry = vi.fn();

    setLoading(paragraph);
    expect(
      paragraph.container.querySelector('[data-imt="loading"]'),
    ).not.toBeNull();

    renderTranslation(paragraph, translationFragment("你好"), {
      mode: "dual",
      theme: "highlight",
      wrapperTag: "font",
      prefix: "smart",
    });
    expect(
      paragraph.container.querySelector('[data-imt="loading"]'),
    ).toBeNull();
    expect(
      paragraph.container.querySelector('[data-imt="target"]'),
    ).not.toBeNull();

    setError(paragraph, "Network error", retry);
    expect(paragraph.container.querySelector('[data-imt="target"]')).toBeNull();
    expect(
      paragraph.container.querySelector('[data-imt="error"]')?.textContent,
    ).toContain("Network error");
    paragraph.container
      .querySelector<HTMLButtonElement>('[data-imt="retry"]')!
      .click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("restores the original DOM exactly when all translations are removed", () => {
    document.body.innerHTML =
      '<article><p class="lead">Hello <em>world</em></p></article>';
    const paragraph = makeParagraph(document.querySelector("p")!);
    markTranslated(paragraph.container, paragraph.id);

    renderTranslation(paragraph, translationFragment("你好世界"), {
      mode: "translation",
      theme: "paper",
      wrapperTag: "font",
      prefix: "smart",
    });
    removeAll(document);

    expect(document.body.innerHTML).toMatchInlineSnapshot(
      `"<article><p class="lead">Hello <em>world</em></p></article>"`,
    );
  });

  it("toggles modes and tracks translated containers", () => {
    document.body.innerHTML = "<p>Hello</p>";
    const paragraph = makeParagraph(document.querySelector("p")!);
    renderTranslation(paragraph, translationFragment("你好"), {
      mode: "dual",
      theme: "none",
      wrapperTag: "font",
      prefix: "smart",
    });

    setMode(document, "translation");
    const source = paragraph.container.querySelector('[data-imt="source"]')!;
    expect(source.classList.contains("imt-source-hidden")).toBe(true);
    setMode(document, "dual");
    expect(source.classList.contains("imt-source-hidden")).toBe(false);

    expect(isTranslated(paragraph.container)).toBe(false);
    markTranslated(paragraph.container, paragraph.id);
    expect(isTranslated(paragraph.container)).toBe(true);
  });
});

describe("injectStyles", () => {
  it("injects site CSS once, then updates the same style", () => {
    injectStyles(document, [".site-rule { color: tomato; }"]);
    const style = document.head.querySelector<HTMLStyleElement>(
      'style[data-imt="style"]',
    )!;

    expect(style.textContent).toContain(".site-rule { color: tomato; }");

    injectStyles(document, [".second-rule { color: teal; }"]);
    expect(
      document.head.querySelectorAll('style[data-imt="style"]'),
    ).toHaveLength(1);
    expect(style.textContent).toContain(".second-rule { color: teal; }");
    expect(style.textContent).not.toContain(".site-rule { color: tomato; }");
  });

  it("defines every theme, shared variables, and dark mode", () => {
    const css = readFileSync("src/content/render/themes.css", "utf8");
    const themes = [
      "none",
      "underline",
      "dashed",
      "dotted",
      "highlight",
      "mask",
      "opacity",
      "blockquote",
      "paper",
      "bold",
      "italic",
      "grey",
      "dividingLine",
      "wavy",
      "marker",
    ];

    for (const theme of themes) {
      expect(css).toContain(`.imt-theme-${theme}`);
    }
    expect(css).toContain("--imt-target-color");
    expect(css).toContain("--imt-target-font");
    expect(css).toContain("--imt-highlight-bg");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });

  it("uses an adopted stylesheet when constructable stylesheets are available", () => {
    const prototype = window.CSSStyleSheet.prototype as CSSStyleSheet & {
      replaceSync?: (css: string) => void;
    };
    const originalReplaceSync = Object.getOwnPropertyDescriptor(
      prototype,
      "replaceSync",
    );
    const cssTexts: string[] = [];
    Object.defineProperty(document, "adoptedStyleSheets", {
      configurable: true,
      value: [],
      writable: true,
    });
    Object.defineProperty(prototype, "replaceSync", {
      configurable: true,
      value(css: string) {
        cssTexts.push(css);
      },
      writable: true,
    });

    try {
      injectStyles(document, [".adopted { color: green; }"]);
      expect(document.adoptedStyleSheets).toHaveLength(1);
      expect(cssTexts.at(-1)).toContain(".adopted { color: green; }");
      expect(document.querySelector('style[data-imt="style"]')).toBeNull();
    } finally {
      removeAll(document);
      Reflect.deleteProperty(document, "adoptedStyleSheets");
      if (originalReplaceSync) {
        Object.defineProperty(prototype, "replaceSync", originalReplaceSync);
      } else {
        Reflect.deleteProperty(prototype, "replaceSync");
      }
    }
  });
});
