import { z } from "zod";

import type { Rule } from "../../shared/types";
import { builtinRules } from "./builtin-rules";
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

const stringArray = z.array(z.string());
const glossarySchema = z.object({
  k: z.string(),
  v: z.string(),
  domain: z.string().optional(),
});

// Importing the shared configuration module initializes a browser-only
// polyfill, so the editor-facing validator keeps an equivalent local schema.
const ruleValidationSchema: z.ZodType<Rule> = z.strictObject({
  id: z.string().optional(),
  matches: stringArray.min(1),
  excludeMatches: stringArray.optional(),
  selectorMatches: stringArray.optional(),
  selectors: stringArray.optional(),
  excludeSelectors: stringArray.optional(),
  additionalExcludeSelectors: stringArray.optional(),
  stayOriginalSelectors: stringArray.optional(),
  additionalStayOriginalSelectors: stringArray.optional(),
  atomicBlockSelectors: stringArray.optional(),
  additionalAtomicBlockSelectors: stringArray.optional(),
  extraInlineSelectors: stringArray.optional(),
  additionalExtraInlineSelectors: stringArray.optional(),
  extraBlockSelectors: stringArray.optional(),
  additionalExtraBlockSelectors: stringArray.optional(),
  shadowRootSelectors: stringArray.optional(),
  additionalShadowRootSelectors: stringArray.optional(),
  mutationExcludeSelectors: stringArray.optional(),
  additionalMutationExcludeSelectors: stringArray.optional(),
  injectedCss: stringArray.optional(),
  additionalInjectedCss: stringArray.optional(),
  excludeTags: stringArray.optional(),
  stayOriginalTags: stringArray.optional(),
  inlineTags: stringArray.optional(),
  allBlockTags: stringArray.optional(),
  isTranslateTitle: z.boolean().optional(),
  paragraphMinTextCount: z.number().int().nonnegative().optional(),
  blockMinTextCount: z.number().int().nonnegative().optional(),
  lineBreakMaxTextCount: z.number().int().nonnegative().optional(),
  targetWrapperTag: z.string().optional(),
  wrapperPrefix: z.string().optional(),
  wrapperSuffix: z.string().optional(),
  sameLangCheck: z.boolean().optional(),
  enableRichTranslate: z.boolean().optional(),
  glossaries: z.array(glossarySchema).optional(),
  additionalGlossaries: z.array(glossarySchema).optional(),
  translationMode: z.enum(["dual", "translation"]).optional(),
  theme: z.string().optional(),
  service: z.string().optional(),
  autoTranslate: z.boolean().optional(),
  mainFrameMinTextCount: z.number().int().nonnegative().optional(),
  likePreSelectors: stringArray.optional(),
  isTransformPreTagNewLine: z.boolean().optional(),
  advanceTransformPreTagNewLine: z.boolean().optional(),
});

export interface MatchRuleOptions {
  hasSelector?: (selector: string) => boolean;
  remoteRules?: readonly Rule[];
  /** Global display defaults, merged below every URL-scoped rule. */
  baseOverrides?: Partial<Rule>;
}

export interface RuleValidationResult {
  ok: boolean;
  errors: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

function compileStars(value: string, replacement: string): string {
  return value.split("*").map(escapeRegExp).join(replacement);
}

function compileAuthority(authority: string): string {
  const bracketEnd = authority.indexOf("]");
  const hasPort =
    bracketEnd >= 0
      ? authority.slice(bracketEnd + 1).startsWith(":")
      : authority.includes(":");

  const compiled = authority.startsWith("*.")
    ? `(?:[^./:?#]+\\.)*${compileStars(authority.slice(2), "[^/:?#]*")}`
    : compileStars(authority, "[^/:?#]*");

  return hasPort ? compiled : `${compiled}(?::\\d+)?`;
}

/** Convert a URL glob into an anchored, case-insensitive regular expression. */
export function globToRegExp(glob: string): RegExp {
  if (glob === "<all_urls>") {
    return /^(?:(?:https?|ftp):\/\/|file:\/\/\/).*$/i;
  }

  const schemeEnd = glob.indexOf("://");
  if (schemeEnd < 0) {
    return new RegExp(`^${compileStars(glob, ".*")}$`, "i");
  }

  const scheme = glob.slice(0, schemeEnd);
  const remainder = glob.slice(schemeEnd + 3);
  const suffixStart = remainder.search(/[/?#]/);
  const authority =
    suffixStart < 0 ? remainder : remainder.slice(0, suffixStart);
  const suffix = suffixStart < 0 ? "" : remainder.slice(suffixStart);
  const compiledScheme =
    scheme === "*"
      ? "[a-z][a-z\\d+.-]*"
      : compileStars(scheme, "[a-z][a-z\\d+.-]*");

  return new RegExp(
    `^${compiledScheme}:\\/\\/${compileAuthority(authority)}${compileStars(suffix, ".*")}$`,
    "i",
  );
}

function urlMatchesGlob(url: string, glob: string): boolean {
  let candidate = url;
  try {
    candidate = new URL(url).href;
  } catch {
    // Invalid URLs cannot be normalized, but matching the input is harmless.
  }
  return globToRegExp(glob).test(candidate);
}

function matchesRule(
  url: string,
  rule: Rule,
  options: MatchRuleOptions,
): boolean {
  if (!rule.matches.some((glob) => urlMatchesGlob(url, glob))) return false;
  if (rule.excludeMatches?.some((glob) => urlMatchesGlob(url, glob))) {
    return false;
  }

  if (!rule.selectorMatches?.length) return true;
  if (!options.hasSelector) return false;
  return rule.selectorMatches.some((selector) =>
    options.hasSelector?.(selector),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return { ...value };
  return value;
}

/**
 * Merge rules from lowest to highest priority.
 * `additional*` arrays append to their target field, ordinary arrays replace,
 * and object-valued fields shallow-merge.
 */
export function mergeRules(base: Rule, ...overrides: Partial<Rule>[]): Rule {
  const result: Record<string, unknown> = {};

  for (const rule of [base, ...overrides]) {
    for (const [rawKey, value] of Object.entries(rule)) {
      if (value === undefined || rawKey in ADDITIONAL_FIELDS) continue;

      const existing = result[rawKey];
      if (isPlainObject(existing) && isPlainObject(value)) {
        result[rawKey] = Object.assign({}, existing, value);
      } else {
        result[rawKey] = cloneValue(value);
      }
    }

    for (const [rawKey, value] of Object.entries(rule)) {
      const target =
        ADDITIONAL_FIELDS[rawKey as keyof typeof ADDITIONAL_FIELDS];
      if (!target || !Array.isArray(value)) continue;

      const existing = result[target];
      result[target] = Array.isArray(existing)
        ? [...existing, ...value]
        : [...value];
    }
  }

  return result as unknown as Rule;
}

/** Merge the general, built-in, and user rules that match a URL. */
export function matchRule(
  url: string,
  userRules: Rule[] = [],
  options: MatchRuleOptions = {},
): Rule {
  const matchingBuiltins = builtinRules.filter((rule) =>
    matchesRule(url, rule, options),
  );
  const matchingRemoteRules = (options.remoteRules ?? []).filter((rule) =>
    matchesRule(url, rule, options),
  );
  const matchingUserRules = userRules.filter((rule) =>
    matchesRule(url, rule, options),
  );

  return mergeRules(
    generalRule,
    options.baseOverrides ?? {},
    ...matchingBuiltins,
    ...matchingRemoteRules,
    ...matchingUserRules,
  );
}

/** Match rules in a content-script document, including selector-gated rules. */
export function matchRuleInPage(
  url: string,
  rules: Rule[],
  document: Document,
): Rule {
  return matchRule(url, rules, {
    hasSelector(selector) {
      try {
        return document.querySelector(selector) !== null;
      } catch {
        return false;
      }
    },
  });
}

/** Validate a parsed value or JSON string for the user rule editor. */
export function validateRule(json: unknown): RuleValidationResult {
  let candidate = json;
  if (typeof json === "string") {
    try {
      candidate = JSON.parse(json) as unknown;
    } catch (error) {
      return {
        ok: false,
        errors: [error instanceof Error ? error.message : "Invalid JSON"],
      };
    }
  }

  const result = ruleValidationSchema.safeParse(candidate);
  if (result.success) return { ok: true, errors: [] };

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "rule";
      return `${path}: ${issue.message}`;
    }),
  };
}
