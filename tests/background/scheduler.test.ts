import { describe, expect, it } from "vitest";

import { TranslationCache } from "../../src/background/cache";
import {
  TranslationScheduler,
  type TranslateParagraphsRequest,
} from "../../src/background/scheduler";
import {
  TranslateError,
  type ServiceTranslateResult,
  type TranslationService,
} from "../../src/background/services/base";
import type { TranslateRequest } from "../../src/shared/types";

class FakeService implements TranslationService {
  readonly name: string;
  readonly placeholder = { open: "{", close: "}" };
  readonly calls: string[][] = [];
  active = 0;
  maximumActive = 0;

  constructor(
    readonly id: string,
    readonly maxBatchSize: number,
    readonly maxBatchChars: number,
    readonly rateLimit: { rps: number; concurrency: number },
    private readonly implementation: (
      request: TranslateRequest,
      signal: AbortSignal,
    ) => Promise<ServiceTranslateResult>,
  ) {
    this.name = id;
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    this.calls.push([...request.texts]);
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    try {
      return await this.implementation(request, signal);
    } finally {
      this.active -= 1;
    }
  }
}

function memoryCache(): TranslationCache {
  return new TranslationCache({ indexedDB: null });
}

function request(
  overrides: Partial<TranslateParagraphsRequest> = {},
): TranslateParagraphsRequest {
  return {
    tabId: 1,
    items: [],
    from: "en",
    to: "zh-CN",
    serviceId: "primary",
    onResult: () => undefined,
    ...overrides,
  };
}

describe("TranslationScheduler", () => {
  it("batches by service limits and schedules priority items first", async () => {
    const service = new FakeService(
      "primary",
      2,
      4,
      { rps: 10_000, concurrency: 1 },
      async ({ texts }) => ({ texts: texts.map((text) => `t:${text}`) }),
    );
    const scheduler = new TranslationScheduler({
      cache: memoryCache(),
      services: [service],
    });
    const results: string[] = [];

    await scheduler.translateParagraphs(
      request({
        items: [
          { id: "a", text: "aa" },
          { id: "b", text: "bb" },
          { id: "p", text: "p", priority: true },
          { id: "c", text: "ccc" },
        ],
        onResult: (batch) => {
          results.push(...batch.map((item) => item.id));
        },
      }),
    );

    expect(service.calls).toEqual([["p", "aa"], ["bb"], ["ccc"]]);
    expect(results).toEqual(["p", "a", "b", "c"]);
  });

  it("does not exceed the service concurrency limit", async () => {
    const service = new FakeService(
      "primary",
      1,
      100,
      { rps: 10_000, concurrency: 2 },
      async ({ texts }) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { texts };
      },
    );
    const scheduler = new TranslationScheduler({
      cache: memoryCache(),
      services: [service],
    });

    await scheduler.translateParagraphs(
      request({
        items: ["a", "b", "c", "d"].map((id) => ({ id, text: id })),
      }),
    );

    expect(service.maximumActive).toBe(2);
  });

  it("returns cache hits without sending them to the service", async () => {
    const cache = memoryCache();
    await cache.set(
      { serviceId: "primary", from: "en", to: "zh-CN", text: "cached" },
      { text: "已缓存", ts: Date.now() },
    );
    const service = new FakeService(
      "primary",
      10,
      100,
      { rps: 10_000, concurrency: 2 },
      async ({ texts }) => ({ texts: texts.map(() => "新译文") }),
    );
    const scheduler = new TranslationScheduler({ cache, services: [service] });
    const batches: Array<Array<{ id: string; text?: string }>> = [];

    await scheduler.translateParagraphs(
      request({
        items: [
          { id: "hit", text: "cached" },
          { id: "miss", text: "new" },
        ],
        onResult: (batch) => {
          batches.push(batch);
        },
      }),
    );

    expect(service.calls).toEqual([["new"]]);
    expect(batches.flat()).toEqual([
      { id: "hit", text: "已缓存" },
      { id: "miss", text: "新译文" },
    ]);
  });

  it("retries a network failure once and then uses the fallback service", async () => {
    const primary = new FakeService(
      "primary",
      10,
      100,
      { rps: 10_000, concurrency: 1 },
      async () => {
        throw new TranslateError("network", "offline", {
          serviceId: "primary",
        });
      },
    );
    const fallback = new FakeService(
      "fallback",
      10,
      100,
      { rps: 10_000, concurrency: 1 },
      async ({ texts }) => ({
        texts: texts.map((text) => `fallback:${text}`),
      }),
    );
    const scheduler = new TranslationScheduler({
      cache: memoryCache(),
      services: [primary, fallback],
      fallbackServices: { primary: "fallback" },
    });
    const output: Array<{ id: string; text?: string }> = [];

    await scheduler.translateParagraphs(
      request({
        items: [{ id: "a", text: "source" }],
        onResult: (batch) => {
          output.push(...batch);
        },
      }),
    );

    expect(primary.calls).toHaveLength(2);
    expect(fallback.calls).toHaveLength(1);
    expect(output).toEqual([{ id: "a", text: "fallback:source" }]);
  });

  it("cancelTab aborts active work for that tab", async () => {
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const service = new FakeService(
      "primary",
      1,
      100,
      { rps: 10_000, concurrency: 1 },
      async (_request, signal) => {
        markStarted?.();
        return await new Promise<ServiceTranslateResult>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new TranslateError("aborted", "cancelled")),
            { once: true },
          );
        });
      },
    );
    const scheduler = new TranslationScheduler({
      cache: memoryCache(),
      services: [service],
    });

    const pending = scheduler.translateParagraphs(
      request({
        tabId: 42,
        items: [{ id: "a", text: "source" }],
      }),
    );
    await started;
    scheduler.cancelTab(42);

    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  });
});
