import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compileCapturePatterns,
  installMainWorldInterceptor,
  matchCapturePatterns,
} from "../../src/content/features/subtitle/interceptor";

const patterns = [
  {
    adapterId: "test",
    urlPattern: "\\.vtt(?:$|[?#])",
    format: "webvtt" as const,
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MAIN-world subtitle interceptor", () => {
  it("ignores invalid regexes and matches declared patterns", () => {
    const compiled = compileCapturePatterns([
      ...patterns,
      { adapterId: "bad", urlPattern: "[", format: "auto" },
    ]);
    expect(compiled).toHaveLength(1);
    expect(
      matchCapturePatterns("https://cdn.test/subs.vtt?x=1", compiled),
    ).toEqual(patterns);
  });

  it("copies matching fetch bodies without replacing the response", async () => {
    const fetchMock = vi.fn(async () => new Response("WEBVTT\n\n"));
    const originalFetch = window.fetch;
    window.fetch = fetchMock;
    const postMessage = vi.spyOn(window, "postMessage");
    const dispose = installMainWorldInterceptor(window);
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: { source: "imt-subtitle-content", type: "configure", patterns },
      }),
    );
    const response = await window.fetch("https://cdn.test/subs.vtt?x=1");
    expect(await response.text()).toBe("WEBVTT\n\n");
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "imt-subtitle-main",
        type: "captured",
        capture: expect.objectContaining({
          adapterId: "test",
          body: "WEBVTT\n\n",
        }),
      }),
      "*",
    );
    dispose();
    window.fetch = originalFetch;
  });
});
