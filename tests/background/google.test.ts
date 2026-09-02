import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleService } from "../../src/background/services/google";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleService", () => {
  it("builds the free endpoint URL and joins translated segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          [
            ["你", "you"],
            ["好", "good"],
          ],
          null,
          "en",
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GoogleService().translate(
      { texts: ["you & good"], from: "en", to: "zh-CN" },
      new AbortController().signal,
    );

    expect(result).toMatchObject({ texts: ["你好"], detectedLanguage: "en" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(
      "https://translate.googleapis.com/translate_a/single",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client: "gtx",
      sl: "en",
      tl: "zh-CN",
      dt: "t",
      q: "you & good",
    });
    expect(new GoogleService().rateLimit.concurrency).toBe(4);
  });
});
