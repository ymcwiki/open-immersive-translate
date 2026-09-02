import { describe, expect, it } from "vitest";

import { generalRule } from "../../src/background/rules/defaults";
import { extractParagraphs } from "../../src/content/extract/scanner";
import {
  joinPreLikeTranslation,
  splitPreLikeText,
} from "../../src/content/extract/pre-like";
import type { AdvancedPageRule, AdvancedParagraph } from "../../src/shared/j-types";

describe("pre-like translation", () => {
  it("splits line cores and restores indentation, trailing spaces, and newlines", () => {
    const lines = splitPreLikeText("  first  \r\n\tsecond\n\n");
    expect(lines).toEqual([
      { leading: "  ", text: "first", trailing: "  ", newline: "\r\n" },
      { leading: "\t", text: "second", trailing: "", newline: "\n" },
      { leading: "", text: "", trailing: "", newline: "\n" },
    ]);
    expect(joinPreLikeTranslation(lines, ["一", "二"])).toBe("  一  \r\n\t二\n\n");
  });

  it("extracts an enabled pre-like block as one whitespace-preserving paragraph", () => {
    document.body.innerHTML = "<pre>  first line\n    second line</pre>";
    const rule = {
      ...generalRule,
      isTranslateTitle: false,
      isTransformPreTagNewLine: true,
      likePreSelectors: ["pre"],
    } as AdvancedPageRule;
    const paragraphs = extractParagraphs(document.body, rule) as AdvancedParagraph[];
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.text).toBe("  first line\n    second line");
    expect(paragraphs[0]?.preformatted).toBe(true);
  });
});
