import { describe, expect, it } from "vitest";

import { translateImmediately } from "../../src/content/observe/immediate";

describe("immediate page-end translation", () => {
  it("bypasses visibility ordering while respecting its concurrency cap", async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const promise = translateImmediately(
      [1, 2, 3, 4, 5],
      async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
      },
      { concurrency: 2 },
    );

    await Promise.resolve();
    expect(active).toBe(2);
    while (releases.length) {
      releases.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
    await promise;
    expect(maximum).toBe(2);
  });
});
