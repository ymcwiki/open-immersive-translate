import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeatureContext } from "../../src/content/features/context";
import {
  init,
  isSingleWord,
  matchesSite,
  parseDictionaryResponse,
  selectVoice,
} from "../../src/content/features/selection-translate";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement
    .querySelectorAll('[data-imt="selection"]')
    .forEach((element) => element.remove());
  vi.restoreAllMocks();
});

describe("selection translation", () => {
  it("shows the translated panel and closes it with Escape", async () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "Selected text";
    document.body.append(paragraph);
    const range = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        right: 80,
        bottom: 35,
        width: 70,
        height: 15,
      }),
    } as unknown as Range;
    vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: paragraph.firstChild,
      focusNode: paragraph.firstChild,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => "Selected text",
    } as unknown as Selection);

    const ctx: FeatureContext = {
      config: {
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        selection: { enabled: true },
      } as FeatureContext["config"],
      rule: { matches: ["<all_urls>"] },
      translateText: vi.fn().mockResolvedValue("选中的文字"),
      translateParagraph: vi.fn(),
      toggleTranslate: vi.fn(),
      isTranslated: vi.fn(),
    };
    const dispose = init(ctx);

    paragraph.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, clientX: 80, clientY: 35 }),
    );
    const host = document.querySelector<HTMLElement>('[data-imt="selection"]')!;
    expect(host).not.toBeNull();
    host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    await vi.waitFor(() => {
      expect(host.shadowRoot!.querySelector(".result")!.textContent).toBe(
        "选中的文字",
      );
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector('[data-imt="selection"]')).toBeNull();
    dispose();
  });

  it("renders a structured dictionary directly for a single word", async () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "hello";
    document.body.append(paragraph);
    vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: paragraph.firstChild,
      focusNode: paragraph.firstChild,
      rangeCount: 1,
      getRangeAt: () =>
        ({
          getBoundingClientRect: () => ({
            right: 60,
            bottom: 30,
            width: 40,
            height: 12,
          }),
        }) as unknown as Range,
      toString: () => "hello",
    } as unknown as Selection);
    const assistant = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          word: "hello",
          phonetic: "/həˈloʊ/",
          parts: [
            {
              partOfSpeech: "interjection",
              definitions: ["问候语"],
              examples: ["Hello, world."],
            },
          ],
        }),
      ),
    };
    const dispose = init(
      {
        config: {
          sourceLanguage: "en",
          targetLanguage: "zh-CN",
          service: "openai-compatible",
          selection: {
            enabled: true,
            dictionary: true,
            triggerMode: "direct",
          },
        } as unknown as FeatureContext["config"],
        rule: { matches: ["<all_urls>"] },
        translateText: vi.fn(),
        translateParagraph: vi.fn(),
        toggleTranslate: vi.fn(),
        isTranslated: vi.fn(),
      },
      { assistant },
    );

    paragraph.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const host = document.querySelector<HTMLElement>('[data-imt="selection"]')!;
    await vi.waitFor(() =>
      expect(host.shadowRoot!.querySelector(".result")!.textContent).toContain(
        "问候语",
      ),
    );
    expect(assistant.complete).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "dictionary", text: "hello" }),
    );
    dispose();
  });

  it("validates dictionary data, site patterns, and language voices", () => {
    expect(isSingleWord("mother-in-law")).toBe(true);
    expect(isSingleWord("two words")).toBe(false);
    expect(
      parseDictionaryResponse(
        '{"word":"run","parts":[{"partOfSpeech":"verb","definitions":["跑"],"examples":[]}]}',
      )?.parts[0]?.definitions,
    ).toEqual(["跑"]);
    expect(matchesSite("https://docs.example.com/a", ["*.example.com"])).toBe(
      true,
    );
    const voices = [
      { name: "English", lang: "en-US", default: false },
      { name: "Japanese", lang: "ja-JP", default: false },
    ] as SpeechSynthesisVoice[];
    expect(selectVoice(voices, "ja", "Japanese")?.name).toBe("Japanese");
  });
});
