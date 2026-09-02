import { describe, expect, it } from "vitest";

import {
  glossaryForDomain,
  resolveTranslationMode,
  resolveTranslationTheme,
  shouldAutoTranslatePage,
} from "../../src/content/controller/patterns";
import type { AdvancedPageConfig, AdvancedPageRule } from "../../src/shared/j-types";

function config(overrides: Partial<AdvancedPageConfig> = {}): AdvancedPageConfig {
  return {
    translationMode: "dual",
    theme: "underline",
    alwaysTranslateSites: [],
    neverTranslateSites: [],
    alwaysTranslateLangs: [],
    neverTranslateLangs: [],
    ...overrides,
  } as AdvancedPageConfig;
}

const rule = { matches: ["<all_urls>"] } as AdvancedPageRule;

describe("page behavior patterns", () => {
  it("gives never-language rules precedence and auto-translates always languages", () => {
    expect(
      shouldAutoTranslatePage(
        config({ alwaysTranslateLangs: ["fr"] }),
        rule,
        "example.com",
        "fr",
      ),
    ).toBe(true);
    expect(
      shouldAutoTranslatePage(
        config({ alwaysTranslateSites: ["example.com"], neverTranslateLangs: ["fr"] }),
        rule,
        "example.com",
        "fr",
      ),
    ).toBe(false);
  });

  it("resolves URL mode before language mode and then rule/default mode", () => {
    const configured = config({
      translationModeUrlPattern: {
        dualMatches: [],
        translationMatches: ["https://reader.example/*"],
      },
      translationModeLanguagePattern: {
        dualMatches: ["fr"],
        translationMatches: [],
      },
    });
    expect(
      resolveTranslationMode(configured, rule, "https://reader.example/post", "fr"),
    ).toBe("translation");
    expect(
      resolveTranslationMode(configured, rule, "https://other.example/post", "fr"),
    ).toBe("dual");
    expect(
      resolveTranslationMode(config(), { ...rule, translationMode: "translation" }, "https://x.test", "en"),
    ).toBe("translation");
  });

  it("applies the first matching per-site theme", () => {
    expect(
      resolveTranslationTheme(
        config({
          translationThemePatterns: {
            paper: ["https://docs.example/*"],
            blur: ["<all_urls>"],
          },
        }),
        rule,
        "https://docs.example/guide",
      ),
    ).toBe("paper");
  });

  it("filters domain-tagged glossary entries and keeps global terms", () => {
    const entries = glossaryForDomain(
      [
        { k: "global", v: "全局" },
        { k: "docs", v: "文档", domain: "docs.example.com" },
        { k: "shop", v: "商店", domain: "*.shop.example.com" },
        { k: "other", v: "其他", domain: "other.example.com" },
      ],
      "api.shop.example.com",
    );
    expect(entries.map(({ k }) => k)).toEqual(["global", "shop"]);
  });
});
