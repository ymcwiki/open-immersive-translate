import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  injectStyles,
  removeAll,
  renderTranslation,
  setMask,
} from "../../src/content/render/inject";
import type { Paragraph } from "../../src/shared/types";

afterEach(() => {
  removeAll(document);
  document.documentElement.classList.remove("imt-translation-mask");
  document.body.replaceChildren();
});

describe("advanced translation rendering", () => {
  it("defines every phase-3 theme and runtime mask selectors", () => {
    const css = readFileSync("src/content/render/themes.css", "utf8");
    for (const theme of [
      "dashedBorder",
      "solidBorder",
      "thinDashed",
      "nativeUnderline",
      "nativeDashed",
      "nativeDotted",
      "weakening",
      "blur",
    ]) {
      expect(css).toContain(`.imt-theme-${theme}`);
    }
    expect(css).toContain(".imt-translation-mask .imt-target");
  });

  it("applies font, size, color, and line-height variables", () => {
    document.body.innerHTML = "<p>Source</p>";
    const container = document.querySelector("p")!;
    const paragraph: Paragraph = {
      id: "p1",
      container,
      nodes: [...container.childNodes],
      text: "Source",
      placeholders: new Map(),
    };
    const fragment = document.createDocumentFragment();
    fragment.append("Target");
    const target = renderTranslation(paragraph, fragment, {
      mode: "dual",
      theme: "solidBorder",
      wrapperTag: "font",
      prefix: "smart",
      style: {
        font: "serif",
        fontSize: "18px",
        color: "#123456",
        lineHeight: 1.8,
      },
    });
    expect(target.style.getPropertyValue("--imt-target-font")).toBe("serif");
    expect(target.style.getPropertyValue("--imt-target-font-size")).toBe("18px");
    expect(target.style.getPropertyValue("--imt-target-color")).toBe("#123456");
    expect(target.style.getPropertyValue("--imt-target-line-height")).toBe("1.8");
  });

  it("toggles mask mode and injects a global custom CSS string once", () => {
    setMask(document, true);
    expect(document.documentElement.classList.contains("imt-translation-mask")).toBe(true);
    injectStyles(document, ["body { --custom-page-rule: 1; }"]);
    expect(document.querySelector('style[data-imt="style"]')?.textContent).toContain(
      "--custom-page-rule: 1",
    );
  });
});
