import { describe, expect, it } from "vitest";

import { mergePageStates, pageTranslationState } from "../../src/content/controller/page-state";

describe("page translation state", () => {
  it("reports idle, translating, done, and error states with counts", () => {
    expect(pageTranslationState({ active: false, total: 0, pending: 0, translated: 0, errors: 0 }).status).toBe("idle");
    expect(pageTranslationState({ active: true, total: 2, pending: 1, translated: 1, errors: 0 }).status).toBe("translating");
    expect(pageTranslationState({ active: true, total: 2, pending: 0, translated: 1, errors: 0 }).status).toBe("translating");
    expect(pageTranslationState({ active: true, total: 2, pending: 0, translated: 2, errors: 0 }).status).toBe("done");
    expect(pageTranslationState({ active: true, total: 2, pending: 0, translated: 1, errors: 1 }).status).toBe("error");
  });

  it("aggregates subframe counts for one action badge", () => {
    expect(
      mergePageStates(
        { status: "done", total: 2, pending: 0, translated: 2, errors: 0 },
        [{ status: "translating", total: 3, pending: 1, translated: 2, errors: 0 }],
      ),
    ).toEqual({ status: "translating", total: 5, pending: 1, translated: 4, errors: 0 });
  });
});
