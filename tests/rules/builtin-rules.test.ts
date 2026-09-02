import { describe, expect, it } from "vitest";

import { builtinRules } from "../../src/background/rules/builtin-rules";
import { generatedRules } from "../../src/background/rules/builtin-rules/index";
import { matchRule, validateRule } from "../../src/background/rules/match";
import type { Rule } from "../../src/shared/types";

describe("builtinRules", () => {
  it("keeps at least 100 generated rules plus the ten hand-written overrides", () => {
    expect(generatedRules.length).toBeGreaterThanOrEqual(100);
    expect(builtinRules).toHaveLength(generatedRules.length + 10);
    expect(new Set(builtinRules.map((rule) => rule.id)).size).toBe(
      builtinRules.length,
    );

    for (const rule of generatedRules as readonly Rule[]) {
      expect(validateRule(rule), rule.id).toEqual({ ok: true, errors: [] });
    }
  });

  it.each([
    ["https://github.com/openai/codex/issues/1", "github"],
    ["https://x.com/openai/status/123", "twitter"],
    ["https://old.reddit.com/r/typescript/comments/abc/post", "reddit"],
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://news.ycombinator.com/item?id=1", "hacker-news"],
    ["https://stackoverflow.com/questions/1/example", "stackoverflow"],
    ["https://zh.wikipedia.org/wiki/Chrome", "wikipedia"],
    ["https://export.arxiv.org/abs/2609.00001", "arxiv"],
    ["https://medium.com/publication/story-123", "medium"],
    ["https://www.google.co.uk/search?q=vitest", "google-search"],
    ["https://developer.mozilla.org/en-US/docs/Web/API", "ported-mdn"],
    ["https://docs.python.org/3/library/asyncio.html", "ported-python-docs"],
    ["https://huggingface.co/docs/transformers", "ported-huggingface"],
    ["https://www.bing.com/search?q=vitest", "ported-bing"],
    ["https://duckduckgo.com/?q=vitest", "ported-duckduckgo"],
    ["https://www.nytimes.com/section/world", "ported-nytimes"],
    ["https://www.nature.com/articles/example", "ported-nature"],
    ["https://www.amazon.com/dp/example", "ported-amazon"],
    ["https://chatgpt.com/c/example", "ported-chatgpt"],
    ["https://claude.ai/new", "ported-claude"],
    ["https://www.zhihu.com/question/1", "ported-zhihu"],
    ["https://www.bilibili.com/video/BV1", "ported-bilibili"],
  ])("selects %s as %s", (url, id) => {
    expect(matchRule(url).id).toBe(id);
  });

  it("does not apply a built-in rule to an unrelated URL", () => {
    expect(matchRule("https://example.com/article").id).toBe("general");
  });

  it("contains the requested content and exclusion surfaces", () => {
    const byId = Object.fromEntries(
      builtinRules.map((rule) => [rule.id, rule]),
    );

    expect(byId.github.selectors).toContain("#readme .markdown-body");
    expect(byId.github.excludeSelectors).toContain(".diff-table");
    expect(byId.twitter.selectors).toEqual(["[data-testid='tweetText']"]);
    expect(byId.twitter.excludeSelectors).toContain(
      "[data-testid='sidebarColumn']",
    );
    expect(byId.reddit.selectors).toEqual(
      expect.arrayContaining([
        "shreddit-comment [slot='comment']",
        ".thing.comment .usertext-body .md",
      ]),
    );
    expect(byId.youtube.selectors).toContain(
      "ytd-compact-video-renderer #video-title",
    );
    expect(byId.youtube.excludeSelectors).toContain("#movie_player");
    expect(byId["hacker-news"].selectors).toEqual([".comment", ".titleline"]);
    expect(byId.stackoverflow.excludeSelectors).toContain("code");
    expect(byId.wikipedia.selectors).toEqual(["#mw-content-text"]);
    expect(byId.wikipedia.excludeSelectors).toContain(".references");
    expect(byId.arxiv.selectors).toContain("blockquote.abstract");
    expect(byId.medium.selectors).toEqual(["article"]);
    expect(byId["google-search"].excludeSelectors).toContain("#tads");
    expect(byId["google-search"].excludeSelectors).toContain(
      ".related-question-pair",
    );
  });

  it("keeps the ten reviewed rules last so they override generated data", () => {
    expect(builtinRules.slice(-10).map(({ id }) => id)).toEqual([
      "github",
      "twitter",
      "reddit",
      "youtube",
      "hacker-news",
      "stackoverflow",
      "wikipedia",
      "arxiv",
      "medium",
      "google-search",
    ]);
  });

  it("uses syntactically valid CSS selectors", () => {
    const selectorFields = [
      "selectorMatches",
      "selectors",
      "excludeSelectors",
      "additionalExcludeSelectors",
      "stayOriginalSelectors",
      "additionalStayOriginalSelectors",
      "atomicBlockSelectors",
      "additionalAtomicBlockSelectors",
      "extraInlineSelectors",
      "additionalExtraInlineSelectors",
      "extraBlockSelectors",
      "additionalExtraBlockSelectors",
      "shadowRootSelectors",
      "additionalShadowRootSelectors",
      "mutationExcludeSelectors",
      "additionalMutationExcludeSelectors",
    ] as const;

    for (const rule of generatedRules as readonly Rule[]) {
      for (const field of selectorFields) {
        for (const selector of rule[field] ?? []) {
          expect(
            () => document.querySelector(selector),
            `${rule.id}.${field}: ${selector}`,
          ).not.toThrow();
        }
      }
    }
  });
});
