import { afterEach, describe, expect, it, vi } from "vitest";

import { DeepLXService } from "../../src/background/services/deeplx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeepLXService", () => {
  it("posts one text to the DeepLX translate endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: "Hallo" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new DeepLXService({ baseUrl: "https://deeplx.example/" });

    await expect(
      service.translate(
        { texts: ["Hello"], from: "en", to: "de" },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ texts: ["Hallo"] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://deeplx.example/translate");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "Hello",
      source_lang: "en",
      target_lang: "de",
    });
  });
});
