import type { Rule } from "../../shared/types";
import { generalRule } from "./defaults";

const ADDITIONAL_FIELDS = {
  additionalExcludeSelectors: "excludeSelectors",
  additionalStayOriginalSelectors: "stayOriginalSelectors",
  additionalAtomicBlockSelectors: "atomicBlockSelectors",
  additionalExtraInlineSelectors: "extraInlineSelectors",
  additionalExtraBlockSelectors: "extraBlockSelectors",
  additionalShadowRootSelectors: "shadowRootSelectors",
  additionalMutationExcludeSelectors: "mutationExcludeSelectors",
  additionalInjectedCss: "injectedCss",
  additionalGlossaries: "glossaries",
} as const satisfies Partial<Record<keyof Rule, keyof Rule>>;

/**
 * Merge rules from lowest to highest priority.
 * `additional*` arrays append to their base field; all other defined fields override.
 */
export function mergeRules(base: Rule, ...overrides: Partial<Rule>[]): Rule {
  const result = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ]),
  ) as unknown as Rule;

  for (const override of overrides) {
    for (const [rawKey, value] of Object.entries(override)) {
      if (value === undefined) continue;

      const key = rawKey as keyof Rule;
      const appendTarget = (
        ADDITIONAL_FIELDS as Partial<Record<keyof Rule, keyof Rule>>
      )[key];
      if (appendTarget) continue;

      Object.assign(result, {
        [key]: Array.isArray(value) ? [...value] : value,
      });
    }

    for (const [rawKey, value] of Object.entries(override)) {
      if (!Array.isArray(value)) continue;

      const key = rawKey as keyof Rule;
      const appendTarget = (
        ADDITIONAL_FIELDS as Partial<Record<keyof Rule, keyof Rule>>
      )[key];
      if (!appendTarget) continue;

      const existing = result[appendTarget];
      Object.assign(result, {
        [appendTarget]: Array.isArray(existing)
          ? [...existing, ...value]
          : [...value],
      });
    }
  }

  return result;
}

/** Return the merged rule for a URL and optional document. */
export function matchRule(url: string, doc?: Document): Rule {
  // TODO(phase1:rules): Match built-in and user rules before merging them.
  void url;
  void doc;
  return mergeRules(generalRule);
}
