import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeatureContext } from "../../src/content/features/context";
import { init } from "../../src/content/features/selection-translate";

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
});
