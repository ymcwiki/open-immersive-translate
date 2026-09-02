import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeatureContext } from "../../src/content/features/context";
import { init } from "../../src/content/features/hover-translate";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("hover translation", () => {
  it("chooses the nearest configured block and translates it once", () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      "<div><p id='paragraph'><span id='word'>Text</span></p></div>";
    const paragraph = document.querySelector("#paragraph")!;
    const word = document.querySelector("#word")!;
    const translateParagraph = vi.fn().mockResolvedValue(undefined);
    const ctx: FeatureContext = {
      config: {
        hover: { enabled: true, holdKey: "Alt" },
      } as FeatureContext["config"],
      rule: { matches: ["<all_urls>"], allBlockTags: ["DIV", "P"] },
      translateText: vi.fn(),
      translateParagraph,
      toggleTranslate: vi.fn(),
      isTranslated: vi.fn(),
    };
    const dispose = init(ctx);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", altKey: true }),
    );
    word.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, altKey: true }),
    );
    vi.advanceTimersByTime(200);
    word.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, altKey: true }),
    );
    vi.advanceTimersByTime(200);

    expect(translateParagraph).toHaveBeenCalledTimes(1);
    expect(translateParagraph).toHaveBeenCalledWith(paragraph);
    dispose();
  });
});
