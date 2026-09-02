import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAICompatibleService } from "../../src/background/services/openai-compatible";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleService", () => {
  it("sends a YAML batch and aligns out-of-order ids with a per-item missing error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "```yaml\n- id: 3\n  text: third translated\n- id: 1\n  text: first translated\n```",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new OpenAICompatibleService({
      apiKey: "secret",
      baseUrl: "https://api.example/v1/",
      model: "test-model",
      temperature: 0.2,
      maxTokens: 500,
      headers: { "X-Extra": "yes" },
      prompt: "{{from}}>{{to}} {{title}} {{glossary}}",
    });

    const result = await service.translate(
      {
        texts: ["first", "second", "third"],
        from: "en",
        to: "zh-CN",
        glossary: [{ k: "term", v: "术语" }],
        context: { title: "Page" },
      },
      new AbortController().signal,
    );

    expect(result.texts).toEqual(["first translated", "", "third translated"]);
    expect(result.errors?.[1]).toMatchObject({ code: "BAD_RESPONSE" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example/v1/chat/completions");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret",
      "X-Extra": "yes",
    });
    const body = JSON.parse(init.body as string) as {
      model: string;
      temperature: number;
      max_tokens: number;
      messages: Array<{ content: string }>;
    };
    expect(body).toMatchObject({
      model: "test-model",
      temperature: 0.2,
      max_tokens: 500,
    });
    expect(body.messages[0].content).toContain("en>zh-CN Page term: 术语");
    expect(body.messages[1].content).toContain('- id: 2\n  text: "second"');
  });

  it("marks a configured refusal response as an item error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "- id: 1\n  text: REFUSE_ME" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const service = new OpenAICompatibleService({
      ignoreResRegexs: ["REFUSE_ME"],
    });

    await expect(
      service.translate(
        { texts: ["source"], from: "en", to: "zh-CN" },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "CONTENT_BLOCKED", kind: "refused" });
  });
});
