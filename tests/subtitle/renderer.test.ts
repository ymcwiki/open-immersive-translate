import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SUBTITLE_CONFIG } from "../../src/shared/subtitle-types";
import {
  hexToRgba,
  SubtitleRenderer,
} from "../../src/content/features/subtitle/renderer";

afterEach(() => {
  document.body.replaceChildren();
  document
    .querySelectorAll('[data-imt="subtitle-overlay"]')
    .forEach((item) => item.remove());
});

function pointer(type: string, x: number, y: number): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  return event;
}

describe("SubtitleRenderer", () => {
  it("renders display modes inside a shadow root and hides native tracks", () => {
    const video = document.createElement("video");
    document.body.append(video);
    const nativeTrack = { mode: "showing" as TextTrackMode };
    Object.defineProperty(video, "textTracks", {
      configurable: true,
      value: { 0: nativeTrack, length: 1 },
    });
    const renderer = new SubtitleRenderer(video, DEFAULT_SUBTITLE_CONFIG, {
      experimental: true,
      experimentalLabel: "实验性字幕适配",
    });
    renderer.setCues([
      { start: 0, end: 2, text: "Hello", translation: "你好" },
    ]);
    renderer.renderAt(1);
    const root = renderer.host.shadowRoot;
    expect(root?.querySelector(".source")?.textContent).toBe("Hello");
    expect(root?.querySelector(".translation")?.textContent).toBe("你好");
    expect(root?.querySelector(".badge")?.textContent).toBe("实验性字幕适配");
    expect(nativeTrack.mode).toBe("hidden");

    renderer.updateStyle({ mode: "source-only" });
    expect((root?.querySelector(".translation") as HTMLElement).hidden).toBe(
      true,
    );
    renderer.dispose();
    expect(nativeTrack.mode).toBe("showing");
  });

  it("persists drag offsets after pointer release", () => {
    const video = document.createElement("video");
    document.body.append(video);
    const onStyleChange = vi.fn();
    const renderer = new SubtitleRenderer(video, DEFAULT_SUBTITLE_CONFIG, {
      onStyleChange,
    });
    const caption = renderer.host.shadowRoot?.querySelector(".caption");
    caption?.dispatchEvent(pointer("pointerdown", 10, 20));
    window.dispatchEvent(pointer("pointermove", 25, 45));
    window.dispatchEvent(pointer("pointerup", 25, 45));
    expect(onStyleChange).toHaveBeenCalledWith(
      expect.objectContaining({ offsetX: 15, offsetY: 25 }),
    );
    renderer.dispose();
  });

  it("converts configured background colors", () => {
    expect(hexToRgba("#080808", 0.75)).toBe("rgba(8, 8, 8, 0.75)");
  });
});
