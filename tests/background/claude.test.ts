import { afterEach, describe, expect, it, vi } from "vitest";

import { ClaudeService } from "../../src/background/services/claude";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClaudeService", () => {
  it("uses the Anthropic messages API and parses the aligned YAML response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "- id: 1\n  text: 你好" }],
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new ClaudeService({
      apiKey: "anthropic-key",
      baseUrl: "https://claude.example/v1",
      model: "claude-test",
    });

    const result = await service.translate(
      { texts: ["hello"], from: "en", to: "zh-CN" },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      texts: ["你好"],
      usage: { inputTokens: 10, outputTokens: 2 },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://claude.example/v1/messages");
    expect(init.headers).toMatchObject({
      "x-api-key": "anthropic-key",
      "anthropic-version": "2023-06-01",
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "claude-test", max_tokens: 4096 });
    expect(body).toHaveProperty("system");
  });
});
