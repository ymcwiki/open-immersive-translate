import { afterEach, describe, expect, it, vi } from "vitest";

const portPosts = vi.hoisted(() => [] as unknown[]);
const portListeners = vi.hoisted(() => [] as Array<(message: unknown) => void>);
const disconnectListeners = vi.hoisted(() => [] as Array<() => void>);
const controllerStorage = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
}));
const browserMock = vi.hoisted(() => ({
  runtime: {
    connect: vi.fn(() => ({
      postMessage: vi.fn((message: unknown) => portPosts.push(message)),
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) =>
          portListeners.push(listener),
        ),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn((listener: () => void) =>
          disconnectListeners.push(listener),
        ),
        removeListener: vi.fn(),
      },
      disconnect: vi.fn(),
    })),
  },
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({
        [key]: controllerStorage.values[key],
      })),
      set: vi.fn(async (patch: Record<string, unknown>) => {
        Object.assign(controllerStorage.values, patch);
      }),
    },
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import { generalRule } from "../../src/background/rules/defaults";
import { DEFAULT_CONFIG } from "../../src/shared/config";
import { TranslationController } from "../../src/content/controller/translation-controller";
import { TRANSLATION_OVERRIDES_KEY } from "../../src/content/controller/editable";
import { extractParagraphs } from "../../src/content/extract/scanner";
import type { AdvancedPageConfig } from "../../src/shared/j-types";
import type { Config } from "../../src/shared/types";

function config(): Config {
  return {
    ...structuredClone(DEFAULT_CONFIG),
    floatBall: { enabled: false, position: "right" },
    subtitle: { ...DEFAULT_CONFIG.subtitle, youtube: false },
  };
}

afterEach(() => {
  vi.useRealTimers();
  portPosts.length = 0;
  portListeners.length = 0;
  disconnectListeners.length = 0;
  controllerStorage.values = {};
  vi.clearAllMocks();
  document.documentElement.lang = "";
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("TranslationController", () => {
  it("translates only main prose and sends domain glossary plus page context", async () => {
    vi.useFakeTimers();
    document.title = "Test article";
    document.body.innerHTML = `
      <nav><p>Navigation links should stay outside the translation request.</p></nav>
      <article><p>This is the main article and it contains enough words for detection.</p></article>
      <footer><p>Footer words should also stay outside the translation request.</p></footer>`;
    const advanced = Object.assign(config(), {
      glossaries: [
        { k: "article", v: "文章", domain: "localhost" },
        { k: "footer", v: "页脚", domain: "other.test" },
      ],
      translationModeUrlPattern: {
        dualMatches: [],
        translationMatches: ["http://localhost:*/*"],
      },
      translationThemePatterns: { paper: ["http://localhost:*/*"] },
      translationFontSize: "17px",
      translationColor: "#123456",
      translationLineHeight: 1.7,
      globalCustomCss: "body { --workstream-j-global: 1; }",
      contextWordLimit: 5,
    }) as AdvancedPageConfig;
    const states = vi.fn();
    const controller = new TranslationController(advanced, generalRule, {
      reportState: states,
    });
    controller.start("main");
    expect(
      document.querySelector('style[data-imt="style"]')?.textContent,
    ).toContain("--workstream-j-global: 1");
    await vi.advanceTimersByTimeAsync(150);

    const request = portPosts.find(
      (
        item,
      ): item is {
        type: "translate";
        requestId: string;
        paragraphs: Array<{ id: string; text: string }>;
        glossary: Array<{ k: string; v: string }>;
        context: { title?: string; summary?: string };
      } => (item as { type?: string }).type === "translate",
    );
    expect(request).toBeDefined();
    expect(request?.paragraphs.map(({ text }) => text).join(" ")).toContain(
      "main article",
    );
    expect(request?.paragraphs.map(({ text }) => text).join(" ")).not.toContain(
      "Navigation",
    );
    expect(request?.paragraphs.map(({ text }) => text).join(" ")).not.toContain(
      "Footer",
    );
    expect(request?.glossary).toEqual([{ k: "article", v: "文章" }]);
    expect(request?.context.title).toBe("Test article");
    expect(request?.context.summary?.split(/\s+/)).toHaveLength(5);

    portListeners[0]?.({
      type: "translateResult",
      requestId: request?.requestId,
      results:
        request?.paragraphs.map(({ id }) => ({ id, text: "译文" })) ?? [],
      done: true,
    });
    const target = document.querySelector<HTMLElement>('[data-imt="target"]');
    expect(target?.classList.contains("imt-theme-paper")).toBe(true);
    expect(target?.style.getPropertyValue("--imt-target-font-size")).toBe(
      "17px",
    );
    expect(target?.style.getPropertyValue("--imt-target-color")).toBe(
      "#123456",
    );
    expect(document.querySelector('[data-imt="source"]')?.classList).toContain(
      "imt-source-hidden",
    );
    expect(states).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done" }),
    );
    controller.destroy();
  });

  it("reapplies a saved per-site override without a translation request", async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      "<article><p>This saved paragraph has enough English words for language detection.</p></article>";
    const rule = { ...generalRule, isTranslateTitle: false };
    const paragraph = extractParagraphs(
      document.querySelector("article")!,
      rule,
    )[0]!;
    controllerStorage.values[TRANSLATION_OVERRIDES_KEY] = {
      localhost: { [paragraph.id]: "已保存的译文" },
    };
    const controller = new TranslationController(config(), rule);
    controller.start("main");
    await vi.advanceTimersByTimeAsync(150);

    expect(document.querySelector('[data-imt="target"]')?.textContent).toBe(
      "已保存的译文",
    );
    expect(portPosts).toHaveLength(0);
    controller.destroy();
  });

  it("translates pre-like blocks line by line and restores whitespace", async () => {
    const advanced = Object.assign(config(), {
      translateToPageEndImmediately: true,
      immediateTranslationConcurrency: 2,
    }) as AdvancedPageConfig;
    const rule = {
      ...generalRule,
      isTranslateTitle: false,
      isTransformPreTagNewLine: true,
      likePreSelectors: ["pre"],
    };
    document.body.innerHTML = "<pre>  first line\n\tsecond line  </pre>";
    const controller = new TranslationController(advanced, rule);
    controller.start("whole");
    for (let index = 0; index < 5; index += 1) await Promise.resolve();

    const requests = portPosts.filter(
      (
        item,
      ): item is {
        type: "translate";
        requestId: string;
        paragraphs: Array<{ id: string; text: string }>;
      } => (item as { type?: string }).type === "translate",
    );
    expect(requests.map((request) => request.paragraphs[0]?.text)).toEqual([
      "first line",
      "second line",
    ]);
    for (const request of requests) {
      const source = request.paragraphs[0]!;
      portListeners[0]?.({
        type: "translateResult",
        requestId: request.requestId,
        results: [
          { id: source.id, text: source.text === "first line" ? "一" : "二" },
        ],
        done: true,
      });
    }
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    expect(document.querySelector('[data-imt="target"]')?.textContent).toBe(
      "  一\n\t二  ",
    );
    controller.destroy();
  });
});
