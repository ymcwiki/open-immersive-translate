import { describe, expect, it } from "vitest";

import { buildPageContext } from "../../src/content/controller/page-context";

describe("page translation context", () => {
  it("includes the title and limits the source summary to the first words", () => {
    document.title = "Context title";
    const context = buildPageContext(
      document,
      ["one two three", "four five six"],
      4,
    );
    expect(context).toEqual({ title: "Context title", summary: "one two three four" });
  });
});
