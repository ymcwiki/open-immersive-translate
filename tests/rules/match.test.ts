import { describe, expect, it } from "vitest";

import { mergeRules } from "../../src/background/rules/match";
import type { Rule } from "../../src/shared/types";

describe("mergeRules", () => {
  it("appends additional fields and overrides ordinary fields", () => {
    const base: Rule = {
      matches: ["<all_urls>"],
      selectors: ["main"],
      excludeSelectors: [".base"],
      injectedCss: [".base {}"],
      paragraphMinTextCount: 2,
    };

    const merged = mergeRules(
      base,
      {
        selectors: ["article"],
        additionalExcludeSelectors: [".first"],
        paragraphMinTextCount: 4,
      },
      {
        additionalExcludeSelectors: [".second"],
        injectedCss: [".override {}"],
      },
    );

    expect(merged).toMatchObject({
      matches: ["<all_urls>"],
      selectors: ["article"],
      excludeSelectors: [".base", ".first", ".second"],
      injectedCss: [".override {}"],
      paragraphMinTextCount: 4,
    });
    expect(merged.additionalExcludeSelectors).toBeUndefined();
    expect(base.excludeSelectors).toEqual([".base"]);
  });

  it("can append to an initially absent base field", () => {
    const merged = mergeRules(
      { matches: ["<all_urls>"] },
      { additionalShadowRootSelectors: ["custom-shell"] },
    );

    expect(merged.shadowRootSelectors).toEqual(["custom-shell"]);
  });

  it("applies ordinary overrides before additions regardless of key order", () => {
    const override: Partial<Rule> = {
      additionalExcludeSelectors: [".appended"],
      excludeSelectors: [".replacement"],
    };

    const merged = mergeRules(
      { matches: ["<all_urls>"], excludeSelectors: [".base"] },
      override,
    );

    expect(merged.excludeSelectors).toEqual([".replacement", ".appended"]);
  });
});
