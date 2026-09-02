import { describe, expect, it } from "vitest";

import {
  CURATED_SITES,
  mapReferenceRule,
  portRules,
} from "../../scripts/port-rules";

describe("rule porting script", () => {
  it("keeps a curated set above the phase-three target with unique ids", () => {
    expect(CURATED_SITES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(CURATED_SITES.map(({ id }) => id)).size).toBe(
      CURATED_SITES.length,
    );
  });

  it("maps supported fields, additions, removals, and theme names", () => {
    const mapped = mapReferenceRule({
      id: "reference",
      matches: ["example.com"],
      selectors: ["article"],
      "excludeSelectors.add": [".advertisement", ".remove-me"],
      "excludeSelectors.remove": [".remove-me"],
      "mutationExcludeSelectors.add_v.[1.2.3]": [".ticker"],
      translationTheme: "paper",
      paragraphMinTextCount: 4,
      telemetry: true,
    });

    expect(mapped).toEqual({
      matches: ["example.com"],
      selectors: ["article"],
      additionalExcludeSelectors: [".advertisement"],
      additionalMutationExcludeSelectors: [".ticker"],
      theme: "paper",
      paragraphMinTextCount: 4,
    });
    expect(mapped).not.toHaveProperty("telemetry");
  });

  it("emits only curated ids and canonical extension globs", () => {
    const rules = portRules([
      {
        id: "github",
        matches: ["github.com"],
        selectors: [".markdown-body"],
      },
      {
        id: "not-curated",
        matches: ["tracker.example"],
        selectors: ["body"],
      },
    ]);

    expect(rules).toHaveLength(CURATED_SITES.length);
    expect(rules.some(({ id }) => id === "ported-not-curated")).toBe(false);
    expect(rules.find(({ id }) => id === "ported-github")).toMatchObject({
      matches: ["*://github.com/*", "*://*.github.com/*"],
      selectors: [".markdown-body"],
    });
  });
});
