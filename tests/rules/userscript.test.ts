import { afterEach, describe, expect, it, vi } from "vitest";

import { generalRule } from "../../src/background/rules/defaults";
import {
  isExcludedUserscriptPage,
  UserscriptPageController,
} from "../../src/userscript/page";
import {
  DEFAULT_USERSCRIPT_CONFIG,
  GmUserscriptRuntime,
  type UserscriptConfig,
  type UserscriptGmApi,
  type UserscriptRuntime,
} from "../../src/userscript/runtime";

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  vi.useRealTimers();
});

describe("userscript runtime", () => {
  it("stores popup settings through GM values", async () => {
    let stored: unknown = {
      sourceLanguage: "auto",
      targetLanguage: "en",
      translationMode: "dual",
      theme: "underline",
    };
    const gm: UserscriptGmApi = {
      getValue: <T>(_key: string, fallback: T) => (stored ?? fallback) as T,
      setValue: (_key, value) => {
        stored = value;
      },
      xmlHttpRequest: vi.fn(),
    };
    const runtime = new GmUserscriptRuntime(gm);

    const config = await runtime.saveConfig({
      targetLanguage: "ja",
      translationMode: "translation",
    });

    expect(config).toMatchObject({
      sourceLanguage: "auto",
      targetLanguage: "ja",
      translationMode: "translation",
      theme: "underline",
    });
    expect(stored).toEqual(config);
  });

  it("translates through GM_xmlhttpRequest", async () => {
    let requestUrl = "";
    const gm: UserscriptGmApi = {
      getValue: (_key, fallback) => fallback,
      setValue: vi.fn(),
      xmlHttpRequest: (details) => {
        requestUrl = details.url;
        details.onload({
          status: 200,
          response: [[["你好", "hello"]], null, "en"],
        });
      },
    };
    const runtime = new GmUserscriptRuntime(gm);

    await expect(runtime.translateText("hello", "auto", "zh-CN")).resolves.toBe(
      "你好",
    );
    expect(requestUrl).toContain("translate.googleapis.com");
    expect(requestUrl).toContain("q=hello");
  });
});

describe("userscript page translation", () => {
  it.each([
    "https://example.com/report.pdf",
    "https://example.com/captions.vtt?lang=en",
    "https://video.example/api/timedtext?lang=en",
  ])("excludes PDF and subtitle pages: %s", (url) => {
    expect(isExcludedUserscriptPage(url)).toBe(true);
  });

  it("renders and removes translated paragraphs", async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      "<main><p>This is a source paragraph with enough words.</p></main>";
    const config: UserscriptConfig = { ...DEFAULT_USERSCRIPT_CONFIG };
    const runtime: UserscriptRuntime = {
      getConfig: async () => config,
      saveConfig: async (patch) => ({ ...config, ...patch }),
      translateText: async () => "这是译文。",
      sendMessage: async () => config,
    };
    const controller = new UserscriptPageController(
      runtime,
      config,
      generalRule,
      document,
    );

    controller.start();
    await vi.advanceTimersByTimeAsync(120);
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-imt-userscript="translation"]')
          ?.textContent,
      ).toBe("这是译文。");
    });

    controller.stop();
    expect(
      document.querySelector('[data-imt-userscript="translation"]'),
    ).toBeNull();
    expect(document.body.textContent).toContain("This is a source paragraph");
  });
});
