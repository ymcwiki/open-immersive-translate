import { describe, expect, it } from "vitest";

import { generalRule } from "../../src/background/rules/defaults";
import { validateRule } from "../../src/background/rules/match";

describe("generalRule", () => {
  it("provides a complete, valid extraction baseline", () => {
    expect(validateRule(generalRule)).toEqual({ ok: true, errors: [] });
    expect(generalRule.matches).toEqual(["<all_urls>"]);
    expect(generalRule.excludeTags).toContain("SCRIPT");
    expect(generalRule.stayOriginalTags).toContain("CODE");
    expect(generalRule.mutationExcludeSelectors).toContain("[data-imt]");
    expect(generalRule.translationMode).toBe("dual");
  });
});
