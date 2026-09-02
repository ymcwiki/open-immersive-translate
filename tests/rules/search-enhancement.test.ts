// @vitest-environment-options { "url": "https://www.google.com/search?q=%E4%BA%8C%E5%B0%96%E7%93%A3" }

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeatureContext } from "../../src/content/features/context";
import {
  englishSearchUrl,
  getSearchPage,
  init,
  isTargetLanguageQuery,
} from "../../src/content/features/search-enhancement";

function context(
  enabled: boolean,
  translateText = vi.fn().mockResolvedValue("mitral valve"),
  targetLanguage: FeatureContext["config"]["targetLanguage"] = "zh-CN",
): FeatureContext {
  return {
    config: {
      targetLanguage,
      searchEnhancement: { enabled },
    } as unknown as FeatureContext["config"],
    rule: {} as FeatureContext["rule"],
    translateText,
    translateParagraph: vi.fn(),
    toggleTranslate: vi.fn(),
    isTranslated: vi.fn(),
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = '<main id="search"></main>';
  document.documentElement.lang = "zh-CN";
  window.history.replaceState({}, "", "/search?q=%E4%BA%8C%E5%B0%96%E7%93%A3");
});

describe("search page detection", () => {
  it.each([
    ["https://www.google.co.uk/search?q=heart", "google"],
    ["https://cn.bing.com/search?q=heart", "bing"],
    ["https://duckduckgo.com/?q=heart", "duckduckgo"],
    ["https://html.duckduckgo.com/html/?q=heart", "duckduckgo"],
  ] as const)("reads %s", (url, engine) => {
    expect(getSearchPage(new URL(url))).toEqual({ engine, query: "heart" });
  });

  it("rejects non-result and empty-query URLs", () => {
    expect(getSearchPage(new URL("https://www.google.com/"))).toBeNull();
    expect(
      getSearchPage(new URL("https://www.google.com/search?q=")),
    ).toBeNull();
    expect(
      getSearchPage(new URL("https://example.com/search?q=heart")),
    ).toBeNull();
    expect(
      getSearchPage(new URL("https://google.com.example/search?q=heart")),
    ).toBeNull();
  });
});

describe("query language and result URLs", () => {
  it("matches the configured target language, including short Chinese queries", () => {
    expect(isTargetLanguageQuery("猫", "zh-CN")).toBe(true);
    expect(isTargetLanguageQuery("如何学习 TypeScript", "zh-TW")).toBe(true);
    expect(isTargetLanguageQuery("how to learn TypeScript", "zh-CN")).toBe(
      false,
    );
    expect(isTargetLanguageQuery("English query", "en")).toBe(false);
  });

  it("keeps the engine and resets pagination for the English query", () => {
    const google = new URL(
      "https://www.google.com/search?q=%E4%BA%8C%E5%B0%96%E7%93%A3&start=20&tbm=nws",
    );
    const result = new URL(
      englishSearchUrl(
        { engine: "google", query: "二尖瓣" },
        google,
        "mitral valve",
      ),
    );
    expect(result.origin).toBe(google.origin);
    expect(result.searchParams.get("q")).toBe("mitral valve");
    expect(result.searchParams.get("hl")).toBe("en");
    expect(result.searchParams.has("start")).toBe(false);
    expect(result.searchParams.get("tbm")).toBe("nws");
  });
});

describe("init", () => {
  it("translates a target-language query and mounts one accessible bar", async () => {
    const translateText = vi.fn().mockResolvedValue("mitral valve");
    const dispose = init(context(true, translateText));
    await flush();

    expect(translateText).toHaveBeenCalledOnce();
    expect(translateText).toHaveBeenCalledWith("二尖瓣", "zh-CN", "en");
    const host = document.querySelector<HTMLElement>(
      '[data-imt="search-enhancement"]',
    );
    expect(host).not.toBeNull();
    expect(
      host?.shadowRoot?.querySelector("aside")?.getAttribute("aria-label"),
    ).toBe("英语搜索");
    const link = host?.shadowRoot?.querySelector<HTMLAnchorElement>("a");
    expect(link?.textContent).toContain("mitral valve");
    expect(new URL(link?.href ?? "").searchParams.get("q")).toBe(
      "mitral valve",
    );

    dispose();
    expect(
      document.querySelector('[data-imt="search-enhancement"]'),
    ).toBeNull();
  });

  it("does nothing when disabled or when the query language differs", async () => {
    const disabledTranslate = vi.fn();
    init(context(false, disabledTranslate));
    await flush();
    expect(disabledTranslate).not.toHaveBeenCalled();

    window.history.replaceState({}, "", "/search?q=how+to+test+typescript");
    const mismatchedTranslate = vi.fn();
    init(context(true, mismatchedTranslate));
    await flush();
    expect(mismatchedTranslate).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-imt="search-enhancement"]'),
    ).toBeNull();
  });

  it("does not insert a stale result after query navigation", async () => {
    let resolveTranslation: (value: string) => void = () => undefined;
    const pending = new Promise<string>((resolve) => {
      resolveTranslation = resolve;
    });
    init(context(true, vi.fn().mockReturnValue(pending)));

    window.history.replaceState({}, "", "/search?q=%E5%BF%83%E8%84%8F");
    resolveTranslation("mitral valve");
    await flush();

    expect(
      document.querySelector('[data-imt="search-enhancement"]'),
    ).toBeNull();
  });

  it("lets only the latest initialization insert a bar", async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    init(context(true, vi.fn().mockReturnValue(first)));
    init(context(true, vi.fn().mockResolvedValue("mitral valve")));
    await flush();
    resolveFirst("old result");
    await flush();

    const hosts = document.querySelectorAll('[data-imt="search-enhancement"]');
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.shadowRoot?.textContent).toContain("mitral valve");
    expect(hosts[0]?.shadowRoot?.textContent).not.toContain("old result");
  });
});
