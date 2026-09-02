import { afterEach, describe, expect, it, vi } from "vitest";

import { onUrlChange } from "../../src/content/observe/url-change";

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("onUrlChange", () => {
  it("fires after pushState and restores history when disconnected", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/start");
    const originalPushState = window.history.pushState;
    const callback = vi.fn();
    const stop = onUrlChange(callback);

    window.history.pushState({}, "", "/next?view=1");
    await vi.advanceTimersByTimeAsync(499);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledWith("http://localhost:3000/next?view=1");

    stop();
    expect(window.history.pushState).toBe(originalPushState);
  });

  it("debounces replaceState and hash changes", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/start");
    const callback = vi.fn();
    const stop = onUrlChange(callback, 100);

    window.history.replaceState({}, "", "/replaced");
    window.location.hash = "section";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      "http://localhost:3000/replaced#section",
    );
    stop();
  });
});
