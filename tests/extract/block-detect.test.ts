import { describe, expect, it } from "vitest";

import { isBlockElement } from "../../src/content/extract/block-detect";
import type { Rule } from "../../src/shared/types";

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    matches: ["<all_urls>"],
    allBlockTags: ["DIV", "P"],
    extraBlockSelectors: [],
    extraInlineSelectors: [],
    ...overrides,
  };
}

describe("isBlockElement", () => {
  it("uses configured block tags when layout information is unavailable", () => {
    const element = document.createElement("div");
    expect(isBlockElement(element, rule())).toBe(true);
  });

  it("recognizes computed block display values", () => {
    const element = document.createElement("span");
    element.style.display = "grid";
    document.body.append(element);

    expect(isBlockElement(element, rule())).toBe(true);
  });

  it("lets explicit inline and block selectors override normal detection", () => {
    const div = document.createElement("div");
    div.className = "forced-inline";
    const span = document.createElement("span");
    span.className = "forced-block";

    const configured = rule({
      extraInlineSelectors: [".forced-inline"],
      extraBlockSelectors: [".forced-block"],
    });

    expect(isBlockElement(div, configured)).toBe(false);
    expect(isBlockElement(span, configured)).toBe(true);
  });
});
