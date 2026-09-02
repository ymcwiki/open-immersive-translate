import { describe, expect, it, vi } from "vitest";

import { createFrameSync, frameHasEnoughText } from "../../src/content/controller/frame-sync";

describe("iframe controller gating and sync", () => {
  it("requires the configured amount of frame text", () => {
    document.body.textContent = "short";
    expect(frameHasEnoughText(document, 10)).toBe(false);
    document.body.textContent = "enough frame text";
    expect(frameHasEnoughText(document, 10)).toBe(true);
  });

  it("reports subframe state to top and accepts synced commands", () => {
    let listener: ((event: MessageEvent<unknown>) => void) | undefined;
    const top = { postMessage: vi.fn() };
    const fakeWindow = {
      top,
      document,
      addEventListener: vi.fn((_name: string, callback: (event: MessageEvent<unknown>) => void) => {
        listener = callback;
      }),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const onCommand = vi.fn();
    const sync = createFrameSync(fakeWindow, onCommand);
    const state = { status: "done", total: 1, pending: 0, translated: 1, errors: 0 } as const;

    sync.report(state);
    expect(top.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "imt:page-controller", kind: "state", state }),
      "*",
    );
    listener?.({
      data: {
        channel: "imt:page-controller",
        kind: "command",
        command: "toggleTranslationMask",
      },
      source: top,
    } as unknown as MessageEvent<unknown>);
    expect(onCommand).toHaveBeenCalledWith("toggleTranslationMask");
  });

  it("broadcasts a top-frame command to child frames", () => {
    document.body.innerHTML = "<iframe></iframe>";
    const child = document.querySelector("iframe")?.contentWindow;
    expect(child).toBeDefined();
    const postMessage = vi.spyOn(child!, "postMessage").mockImplementation(() => undefined);
    const sync = createFrameSync(window, vi.fn());
    sync.broadcast("toggleTranslateTheMainPage");
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "imt:page-controller",
        kind: "command",
        command: "toggleTranslateTheMainPage",
      }),
      "*",
    );
    sync.dispose();
  });
});
