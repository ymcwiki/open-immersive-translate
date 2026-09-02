import { afterEach, describe, expect, it, vi } from "vitest";

import { observeViewport } from "../../src/content/observe/viewport";

class FakeIntersectionObserver {
  static instance: FakeIntersectionObserver;

  readonly observed = new Set<Element>();
  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;
  disconnected = false;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instance = this;
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  intersect(...elements: Element[]): void {
    this.callback(
      elements.map(
        (target) =>
          ({
            isIntersecting: true,
            target,
          }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("observeViewport", () => {
  it("observes, batches visible ids, and supports add/remove/disconnect", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "IntersectionObserver",
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    vi.stubGlobal("requestIdleCallback", undefined);
    document.body.innerHTML =
      "<p id='one'></p><p id='two'></p><p id='three'></p>";
    const one = document.querySelector("#one")!;
    const two = document.querySelector("#two")!;
    const three = document.querySelector("#three")!;
    const onVisible = vi.fn();

    const viewport = observeViewport(
      [
        { id: "p1", container: one },
        { id: "p2", container: two },
      ],
      onVisible,
    );
    const fake = FakeIntersectionObserver.instance;
    expect(fake.options?.rootMargin).toBe("100%");
    expect(fake.observed).toEqual(new Set([one, two]));

    fake.intersect(one, two);
    await vi.advanceTimersByTimeAsync(99);
    expect(onVisible).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onVisible).toHaveBeenCalledWith(["p1", "p2"]);

    viewport.add(three, "p3");
    expect(fake.observed.has(three)).toBe(true);
    viewport.remove(three);
    expect(fake.observed.has(three)).toBe(false);

    viewport.disconnect();
    expect(fake.disconnected).toBe(true);
  });

  it("uses requestIdleCallback when the page provides it", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    let idleCallback: IdleRequestCallback | undefined;
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 7;
      }),
    );
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);
    document.body.innerHTML = "<p></p>";
    const container = document.querySelector("p")!;
    const onVisible = vi.fn();
    const viewport = observeViewport(
      [{ id: "p1", container }],
      onVisible,
    );

    FakeIntersectionObserver.instance.intersect(container);
    expect(globalThis.requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 100 },
    );
    idleCallback?.({ didTimeout: false, timeRemaining: () => 10 });
    expect(onVisible).toHaveBeenCalledWith(["p1"]);

    FakeIntersectionObserver.instance.intersect(container);
    viewport.disconnect();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });
});
