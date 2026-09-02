import { describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import {
  joinTimedTextSentences,
  mergeTimedText,
} from "../../src/content/features/youtube-subtitle";

describe("YouTube timed-text helpers", () => {
  it("merges every segment with its ordered translation", () => {
    const payload = {
      events: [
        { tStartMs: 0, segs: [{ utf8: "Hello " }, { utf8: "world." }] },
        { tStartMs: 1000, segs: [{ utf8: "Next" }] },
      ],
    };

    const merged = mergeTimedText(payload, ["你好 ", "世界。", "下一个"]);

    expect(merged.events?.[0].segs?.map((segment) => segment.utf8)).toEqual([
      "Hello \n你好 ",
      "world.\n世界。",
    ]);
    expect(merged.events?.[1].segs?.[0].utf8).toBe("Next\n下一个");
    expect(payload.events[0].segs[0].utf8).toBe("Hello ");
  });

  it("joins word-level segments into one sentence per event", () => {
    const joined = joinTimedTextSentences({
      events: [{ segs: [{ utf8: "Hello " }, { utf8: "world." }] }],
    });

    expect(joined.events?.[0].segs).toEqual([{ utf8: "Hello world." }]);
  });
});
