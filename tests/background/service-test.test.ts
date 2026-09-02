import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({ default: {} }));

import { runServiceTest } from "../../src/background/service-test";
import type { ServiceConfig } from "../../src/shared/types";

function config(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    kind: "openai-compatible",
    enabled: true,
    apiKey: "user-secret",
    baseUrl: "https://api.example.test/v1",
    model: "test-model",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("service connection test", () => {
  it("translates Hello with the user's credentials and returns a sample", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '- id: 1\n  text: "你好"' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runServiceTest("openai-compatible", config(), {
      targetLanguage: "zh-CN",
      now: (() => {
        let value = 10;
        return () => (value += 7);
      })(),
    });

    expect(result).toEqual({ ok: true, latencyMs: 7, sample: "你好" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-secret",
        }),
      }),
    );
  });

  it("returns the adapter's authentication error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
    );

    const result = await runServiceTest("openai-compatible", config(), {
      targetLanguage: "zh-CN",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Translation service rejected the credentials.",
    });
  });

  it("returns a timeout error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );

    const pending = runServiceTest(
      "openai-compatible",
      config({ timeoutMs: 20 }),
      { targetLanguage: "zh-CN" },
    );
    await vi.advanceTimersByTimeAsync(20);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: "Translation request timed out.",
    });
  });
});
