import { describe, expect, it } from "vitest";

import {
  globToRegExp,
  matchRule,
  matchRuleInPage,
  mergeRules,
  validateRule,
} from "../../src/background/rules/match";
import type { Rule } from "../../src/shared/types";

describe("globToRegExp", () => {
  it("matches wildcard schemes, ports, and query strings", () => {
    const pattern = globToRegExp("*://example.com/path*");

    expect(pattern.test("https://example.com/path?q=translation#result")).toBe(
      true,
    );
    expect(pattern.test("http://example.com:8080/path/next")).toBe(true);
    expect(pattern.test("https://example.com/other/path")).toBe(false);
  });

  it("lets a leading hostname wildcard match the root and nested subdomains", () => {
    const pattern = globToRegExp("https://*.github.com/*");

    expect(pattern.test("https://github.com/openai/codex")).toBe(true);
    expect(pattern.test("https://gist.github.com/user/id")).toBe(true);
    expect(pattern.test("https://deep.docs.github.com/page")).toBe(true);
    expect(pattern.test("https://notgithub.com/page")).toBe(false);
  });

  it("escapes regex characters and anchors the whole URL", () => {
    const pattern = globToRegExp("https://example.com/a.b/*");

    expect(pattern.test("https://example.com/a.b/value")).toBe(true);
    expect(pattern.test("https://example.com/axb/value")).toBe(false);
    expect(pattern.test("prefix-https://example.com/a.b/value")).toBe(false);
  });
});

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

  it("shallow-merges object-valued fields", () => {
    type RuleWithMetadata = Rule & {
      metadata: Record<string, string>;
    };
    const base = {
      matches: ["<all_urls>"],
      metadata: { source: "base", keep: "yes" },
    } as RuleWithMetadata;
    const override = {
      metadata: { source: "user", added: "yes" },
    } as unknown as Partial<Rule>;

    const merged = mergeRules(base, override) as RuleWithMetadata;

    expect(merged.metadata).toEqual({
      source: "user",
      keep: "yes",
      added: "yes",
    });
    expect(merged.metadata).not.toBe(base.metadata);
  });
});

describe("matchRule", () => {
  it("merges every matching rule in builtin then user order", () => {
    const userRules: Rule[] = [
      {
        id: "github-user-base",
        matches: ["*://github.com/*"],
        selectors: [".user-prose"],
        additionalExcludeSelectors: [".user-chrome"],
        theme: "highlight",
      },
      {
        id: "github-user-page",
        matches: ["*://github.com/openai/*"],
        additionalExcludeSelectors: [".second-exclusion"],
        theme: "paper",
      },
    ];

    const matched = matchRule(
      "https://github.com/openai/codex/issues/1?tab=comments",
      userRules,
    );

    expect(matched.id).toBe("github-user-page");
    expect(matched.selectors).toEqual([".user-prose"]);
    expect(matched.excludeSelectors).toContain(".diff-table");
    expect(matched.excludeSelectors).toContain(".user-chrome");
    expect(matched.excludeSelectors).toContain(".second-exclusion");
    expect(matched.theme).toBe("paper");
  });

  it("honors excludeMatches", () => {
    const rules: Rule[] = [
      {
        id: "docs-only",
        matches: ["*://example.com/*"],
        excludeMatches: ["*://example.com/admin/*"],
        theme: "grey",
      },
    ];

    expect(matchRule("https://example.com/docs", rules).id).toBe("docs-only");
    expect(matchRule("https://example.com/admin/users", rules).id).toBe(
      "general",
    );
  });

  it("requires selectorMatches to be confirmed by the caller", () => {
    const rules: Rule[] = [
      {
        id: "article-layout",
        matches: ["*://example.com/*"],
        selectorMatches: ["article", ".story"],
        selectors: ["article"],
      },
    ];

    expect(matchRule("https://example.com/post", rules).id).toBe("general");
    expect(
      matchRule("https://example.com/post", rules, {
        hasSelector: (selector) => selector === ".story",
      }).id,
    ).toBe("article-layout");
  });

  it("provides a document-backed selector matcher for content scripts", () => {
    document.body.innerHTML = "<main><article>Story</article></main>";
    const rules: Rule[] = [
      {
        id: "article-layout",
        matches: ["*://example.com/*"],
        selectorMatches: ["article"],
        selectors: ["article"],
      },
    ];

    expect(
      matchRuleInPage("https://example.com/post", rules, document).id,
    ).toBe("article-layout");
  });
});

describe("validateRule", () => {
  it("accepts a valid object or JSON string", () => {
    const rule = {
      id: "example",
      matches: ["*://example.com/*"],
      translationMode: "dual",
      paragraphMinTextCount: 2,
    };

    expect(validateRule(rule)).toEqual({ ok: true, errors: [] });
    expect(validateRule(JSON.stringify(rule))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("rejects malformed JSON and invalid rule fields", () => {
    expect(validateRule('{"matches": [}').ok).toBe(false);

    const invalid = validateRule({
      matches: "*://example.com/*",
      translationMode: "translated",
      paragraphMinTextCount: -1,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("matches"),
        expect.stringContaining("translationMode"),
        expect.stringContaining("paragraphMinTextCount"),
      ]),
    );
  });

  it("rejects missing, empty, and unknown editor input", () => {
    expect(validateRule({ id: "missing-matches" }).ok).toBe(false);
    expect(validateRule({ matches: [] }).ok).toBe(false);
    expect(
      validateRule({ matches: ["*://example.com/*"], typo: true }).ok,
    ).toBe(false);
  });
});
