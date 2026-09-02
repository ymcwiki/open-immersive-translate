import { afterEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    openOptionsPage: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import {
  FLOAT_BALL_POSITION_KEY,
  init,
} from "../../src/content/features/float-ball";
import type { FeatureContext } from "../../src/content/features/context";

function pointerEvent(type: string, x: number, y: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event as PointerEvent;
}

function context(): FeatureContext {
  return {
    config: {
      floatBall: { enabled: true, position: "right" },
      neverTranslateSites: [],
    } as unknown as FeatureContext["config"],
    rule: { matches: ["<all_urls>"] },
    translateText: vi.fn(),
    translateParagraph: vi.fn(),
    toggleTranslate: vi.fn(),
    isTranslated: vi.fn(() => false),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
  document.documentElement
    .querySelectorAll("[data-imt]")
    .forEach((element) => element.remove());
  vi.clearAllMocks();
});

describe("float ball", () => {
  it("persists the final pointer position after a drag", async () => {
    const dispose = init(context());
    const host = document.querySelector<HTMLElement>(
      '[data-imt="float-ball"]',
    )!;
    const button = host.shadowRoot!.querySelector<HTMLButtonElement>(".ball")!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 136,
      bottom: 236,
      width: 36,
      height: 36,
      toJSON: () => ({}),
    });

    button.dispatchEvent(pointerEvent("pointerdown", 110, 210));
    window.dispatchEvent(pointerEvent("pointermove", 160, 260));
    window.dispatchEvent(pointerEvent("pointerup", 160, 260));

    expect(browserMock.storage.local.set).toHaveBeenCalledWith({
      [FLOAT_BALL_POSITION_KEY]: { x: 150, y: 250 },
    });
    expect(host.style.left).toBe("150px");
    expect(host.style.top).toBe("250px");
    dispose();
  });
});
