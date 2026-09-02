import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CustomHttpService,
  readJsonPath,
} from "../../src/background/services/custom-http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CustomHttpService", () => {
  it("renders the request template and reads an array path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { translations: [{ value: "bonjour" }] } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new CustomHttpService({
      url: "https://custom.example/translate",
      method: "PUT",
      headers: { Authorization: "Token value" },
      bodyTemplate:
        '{"input":"{{text}}","source":"{{from}}","target":"{{to}}"}',
      responseJsonPath: "data.translations.0.value",
    });

    const result = await service.translate(
      { texts: ['hello "world"'], from: "en", to: "fr" },
      new AbortController().signal,
    );

    expect(result.texts).toEqual(["bonjour"]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      input: 'hello "world"',
      source: "en",
      target: "fr",
    });
    expect(readJsonPath({ rows: [{ text: "ok" }] }, "rows[0].text")).toBe("ok");
  });
});
