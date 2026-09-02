import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeatureContext } from "../../src/content/features/context";
import {
  init,
  isTripleSpaceTrigger,
  parseTranslationInput,
} from "../../src/content/features/input-translate";

function context(
  translateText = vi.fn().mockResolvedValue("translated"),
): FeatureContext {
  return {
    config: {
      sourceLanguage: "auto",
      input: { enabled: true },
    } as FeatureContext["config"],
    rule: { matches: ["<all_urls>"] },
    translateText,
    translateParagraph: vi.fn(),
    toggleTranslate: vi.fn(),
    isTranslated: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("input translation", () => {
  it("parses an optional language prefix", () => {
    expect(parseTranslationInput("/en 你好", "fr")).toEqual({
      text: "你好",
      targetLanguage: "en",
    });
    expect(parseTranslationInput("//bonjour", "fr")).toEqual({
      text: "bonjour",
      targetLanguage: "fr",
    });
  });

  it("detects three spaces only inside the 1.5 second window", () => {
    expect(isTripleSpaceTrigger([0, 700, 1_500])).toBe(true);
    expect(isTripleSpaceTrigger([0, 700, 1_501])).toBe(false);
  });

  it("translates a double-slash command on Enter", async () => {
    const input = document.createElement("input");
    input.value = "//hello";
    document.body.append(input);
    const translateText = vi.fn().mockResolvedValue("hola");
    const dispose = init(context(translateText));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );

    await vi.waitFor(() => expect(input.value).toBe("hola"));
    expect(translateText).toHaveBeenCalledWith("hello", "auto", "en");
    dispose();
  });

  it("triggers on three consecutive trailing spaces", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const input = document.createElement("textarea");
    input.value = "hello";
    document.body.append(input);
    const translateText = vi.fn().mockResolvedValue("bonjour");
    const dispose = init(context(translateText));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " }),
    );
    input.value = "hello ";
    vi.advanceTimersByTime(500);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " }),
    );
    input.value = "hello  ";
    vi.advanceTimersByTime(500);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " }),
    );
    await Promise.resolve();

    expect(translateText).toHaveBeenCalledWith("hello", "auto", "en");
    expect(input.value).toBe("bonjour");
    dispose();
  });

  it("asks before translating more than 200 characters", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const translateText = vi.fn().mockResolvedValue("unused");
    const input = document.createElement("textarea");
    input.value = `//${"a".repeat(201)}`;
    document.body.append(input);
    const dispose = init(context(translateText));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );

    expect(confirm).toHaveBeenCalledOnce();
    expect(translateText).not.toHaveBeenCalled();
    expect(input.disabled).toBe(false);
    dispose();
  });
});
