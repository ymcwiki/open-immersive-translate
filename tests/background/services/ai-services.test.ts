import { afterEach, describe, expect, it, vi } from "vitest";

import { AzureOpenAIService } from "../../../src/background/services/azure-openai";
import { ClaudeService } from "../../../src/background/services/claude";
import { GeminiService } from "../../../src/background/services/gemini";
import { OpenAICompatibleService } from "../../../src/background/services/openai-compatible";
import { createPresetService } from "../../../src/background/services/presets";

const request = {
  texts: ["hello"],
  from: "en" as const,
  to: "zh-CN" as const,
  context: { title: "Example", summary: "Greeting" },
};

function sse(...events: unknown[]): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("phase-3 AI services", () => {
  it("calls Gemini generateContent with a system_instruction and YAML batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "- id: 1\n  text: 你好" }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GeminiService({
      apiKey: "gemini-key",
      model: "gemini-test",
    }).translate(request, new AbortController().signal);

    expect(result.texts).toEqual(["你好"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/models/gemini-test:generateContent?key=gemini-key");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty("system_instruction");
    expect(JSON.stringify(body)).toContain("- id: 1");
    expect(JSON.stringify(body)).toContain("Greeting");
  });

  it("streams OpenAI-compatible deltas through onPartial and returns aligned YAML", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sse(
            { choices: [{ delta: { content: "- id: 1\n" } }] },
            { choices: [{ delta: { content: "  text: 你好" } }] },
          ),
        ),
    );
    const partials: string[] = [];
    const service = new OpenAICompatibleService({ stream: true });

    const result = await service.translate(
      request,
      new AbortController().signal,
      {
        onPartial: (text) => {
          partials.push(text);
        },
      },
    );

    expect(partials).toEqual(["- id: 1\n", "- id: 1\n  text: 你好"]);
    expect(result.texts).toEqual(["你好"]);
  });

  it("streams Claude text_delta events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sse(
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "- id: 1\n" },
          },
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "  text: 你好" },
          },
        ),
      ),
    );
    const partials: string[] = [];

    const result = await new ClaudeService({ stream: true }).translate(
      request,
      new AbortController().signal,
      {
        onPartial: (text) => {
          partials.push(text);
        },
      },
    );

    expect(partials.at(-1)).toBe("- id: 1\n  text: 你好");
    expect(result.texts).toEqual(["你好"]);
  });

  it("streams Gemini SSE chunks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sse(
          { candidates: [{ content: { parts: [{ text: "- id: 1\n" }] } }] },
          { candidates: [{ content: { parts: [{ text: "  text: 你好" }] } }] },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const partials: string[] = [];

    const result = await new GeminiService({ stream: true }).translate(
      request,
      new AbortController().signal,
      {
        onPartial: (text) => {
          partials.push(text);
        },
      },
    );

    expect(fetchMock.mock.calls[0]?.[0] as string).toContain(
      ":streamGenerateContent?alt=sse",
    );
    expect(partials.at(-1)).toContain("text: 你好");
    expect(result.texts).toEqual(["你好"]);
  });

  it("uses Azure's deployment URL, api-version, and api-key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "- id: 1\n  text: 你好" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AzureOpenAIService({
      apiKey: "azure-key",
      baseUrl: "https://resource.openai.azure.com",
      deployment: "translator",
      apiVersion: "2025-01-01-preview",
    }).translate(request, new AbortController().signal);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://resource.openai.azure.com/openai/deployments/translator/chat/completions?api-version=2025-01-01-preview",
    );
    expect(init.headers).toMatchObject({ "api-key": "azure-key" });
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(result.texts).toEqual(["你好"]);
  });

  it("creates registered presets as fetch-backed OpenAI-compatible services", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "- id: 1\n  text: 你好" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = createPresetService("deepseek", { apiKey: "key" });

    const result = await service?.translate(
      request,
      new AbortController().signal,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(result?.texts).toEqual(["你好"]);
  });
});
