import { afterEach, describe, expect, it, vi } from "vitest";

import { installDirectHoverTranslation } from "../../src/content/controller/hover-directly";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("direct hover translation", () => {
  it("translates a hovered block without any modifier key", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "<p><span>Hover this paragraph</span></p>";
    const translate = vi.fn().mockResolvedValue(undefined);
    const dispose = installDirectHoverTranslation(translate, ["p"]);
    document.querySelector("span")?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(translate).toHaveBeenCalledWith(document.querySelector("p"));
    dispose();
  });
});
