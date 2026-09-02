import { describe, expect, it } from "vitest";

import {
  TranslationCache,
  type TranslationCacheKey,
} from "../../src/background/cache";

const firstKey: TranslationCacheKey = {
  serviceId: "service-a",
  from: "en",
  to: "zh-CN",
  text: "hello",
};

describe("TranslationCache", () => {
  it("round-trips single and bulk values in the memory fallback", async () => {
    const cache = new TranslationCache({ indexedDB: null });
    await cache.set(firstKey, { text: "你好", ts: 100 });
    expect(await cache.get(firstKey)).toEqual({ text: "你好", ts: 100 });

    const secondKey = { ...firstKey, text: "world" };
    await cache.setMany([{ key: secondKey, value: { text: "世界", ts: 200 } }]);
    expect(await cache.getMany([firstKey, secondKey])).toEqual([
      { text: "你好", ts: 100 },
      { text: "世界", ts: 200 },
    ]);
  });

  it("purges expired values and clears retained values", async () => {
    const cache = new TranslationCache({ indexedDB: null });
    const oldKey = { ...firstKey, text: "old" };
    const freshKey = { ...firstKey, text: "fresh" };
    await cache.set(oldKey, {
      text: "old translation",
      ts: Date.now() - 2 * 86_400_000,
    });
    await cache.set(freshKey, { text: "fresh translation", ts: Date.now() });

    await cache.purge(1);
    expect(await cache.get(oldKey)).toBeUndefined();
    expect(await cache.get(freshKey)).toBeDefined();
    await cache.clear();
    expect(await cache.get(freshKey)).toBeUndefined();
  });
});
