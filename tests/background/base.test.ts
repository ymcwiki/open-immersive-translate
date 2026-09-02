import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TranslateError,
  fetchWithTimeout,
  mapWithConcurrency,
  responseError,
} from "../../src/background/services/base";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("service base helpers", () => {
  it("classifies authentication and rate-limit responses", async () => {
    await expect(
      responseError(new Response("no", { status: 401 }), "svc"),
    ).resolves.toMatchObject({ code: "AUTH", retryable: false });
    await expect(
      responseError(new Response("slow", { status: 429 }), "svc"),
    ).resolves.toMatchObject({ code: "RATE_LIMIT", retryable: true });
  });

  it("honors an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      fetchWithTimeout(
        "https://example.test",
        {},
        controller.signal,
        30_000,
        "svc",
      ),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps in order with bounded concurrency", async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });

    expect(result).toEqual([2, 4, 6, 8]);
    expect(maximum).toBe(2);
    expect(new TranslateError("network", "failed")).toMatchObject({
      code: "NETWORK",
      retryable: true,
    });
  });
});
