import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ stored: {} as Record<string, unknown> }));
const browserMock = vi.hoisted(() => ({
  runtime: {
    getManifest: vi.fn(() => ({ version: "1.2.3" })),
  },
  storage: {
    local: {
      get: vi.fn(async () => ({ ...state.stored })),
      set: vi.fn(async (value: Record<string, unknown>) => {
        Object.assign(state.stored, value);
      }),
      remove: vi.fn(async (key: string) => {
        delete state.stored[key];
      }),
    },
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import { readSse } from "../../src/background/services/stream";
import {
  CHATGPT_AUTH_STORAGE_KEY,
  type ChatgptOauthTokens,
} from "../../src/background/services/chatgpt-oauth/auth";
import {
  CHATGPT_MODELS_STORAGE_KEY,
  CODEX_MODELS_URL,
  CODEX_RESPONSES_URL,
  ChatgptOauthService,
  buildChatgptHeaders,
  getChatgptModels,
  parseCodexSseEvent,
  selectDefaultChatgptModel,
} from "../../src/background/services/chatgpt-oauth/service";

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode(payload)}.`;
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function storedTokens(
  accessToken: string,
  refreshToken = "refresh-1",
): ChatgptOauthTokens {
  return { accessToken, refreshToken, obtainedAt: Date.now() };
}

beforeEach(() => {
  state.stored = {};
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Codex SSE", () => {
  it("concatenates multiple events across split chunks and reports partial text", async () => {
    const partials: string[] = [];
    const response = sseResponse([
      'event: response.output_text.delta\ndata: {"delta":"- id: 1\\n  te',
      'xt: 你"}\n\ndata: {"type":"response.output_text.delta","delta":"好"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed"}\n\n',
    ]);

    await expect(
      readSse(response, "chatgpt", parseCodexSseEvent, {
        onPartial: (text) => {
          partials.push(text);
        },
      }),
    ).resolves.toBe("- id: 1\n  text: 你好");
    expect(partials).toEqual(["- id: 1\n  text: 你", "- id: 1\n  text: 你好"]);
  });

  it("throws the message from an SSE error event", async () => {
    const response = sseResponse([
      'event: error\ndata: {"message":"upstream failed"}\n\n',
    ]);
    await expect(
      readSse(response, "chatgpt", parseCodexSseEvent),
    ).rejects.toMatchObject({ message: "upstream failed" });
  });
});

describe("ChatgptOauthService", () => {
  it("builds required identity headers from the OAuth JWT", () => {
    const accessToken = jwt({
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" },
    });
    expect(buildChatgptHeaders(storedTokens(accessToken))).toMatchObject({
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-ID": "acct-1",
      originator: "bilingual-translator",
      "User-Agent": "bilingual-translator/1.2.3",
      Accept: "text/event-stream",
    });
  });

  it("selects the first non-Codex GPT-5 mini model", () => {
    expect(
      selectDefaultChatgptModel([
        "gpt-5.3-codex-mini",
        "gpt-5.6-mini",
        "gpt-5.4-mini",
      ]),
    ).toBe("gpt-5.6-mini");
    expect(selectDefaultChatgptModel(["gpt-5.3-codex"])).toBe("gpt-5.4-mini");
  });

  it("probes and caches the account model catalog", async () => {
    const accessToken = jwt({
      exp: Math.floor(Date.now() / 1_000) + 3_600,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" },
    });
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: storedTokens(accessToken),
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            models: [
              { slug: "gpt-5.4-mini", priority: 2 },
              { slug: "hidden-model", priority: 1, visibility: "hidden" },
              { slug: "gpt-5.6-mini", priority: 1 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getChatgptModels(true)).resolves.toEqual([
      "gpt-5.6-mini",
      "gpt-5.4-mini",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      CODEX_MODELS_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          "ChatGPT-Account-ID": "acct-1",
        }),
      }),
    );
    expect(state.stored[CHATGPT_MODELS_STORAGE_KEY]).toMatchObject({
      models: ["gpt-5.6-mini", "gpt-5.4-mini"],
    });
  });

  it("sends the Responses API body and maps a streamed YAML batch", async () => {
    const accessToken = jwt({
      exp: Math.floor(Date.now() / 1_000) + 3_600,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" },
    });
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: storedTokens(accessToken),
    };
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"type":"response.output_text.delta","delta":"- id: 2\\n  text: 二\\n"}\n\n',
        'data: {"type":"response.output_text.delta","delta":"- id: 1\\n  text: 一"}\n\n',
        'data: {"type":"response.completed"}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new ChatgptOauthService({ model: "gpt-5.4-mini" });

    await expect(
      service.translate(
        { texts: ["one", "two"], from: "en", to: "zh-CN" },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ texts: ["一", "二"] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(CODEX_RESPONSES_URL);
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-ID": "acct-1",
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      reasoning: { effort: "low" },
      store: false,
      stream: true,
    });
    expect(body.instructions).toEqual(expect.any(String));
    expect(body.input).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: expect.stringContaining('- id: 1\n  text: "one"'),
          },
        ],
      },
    ]);
  });

  it("uses separate configured efforts for translation and assistant requests", async () => {
    const accessToken = jwt({
      exp: Math.floor(Date.now() / 1_000) + 3_600,
    });
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: storedTokens(accessToken),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"type":"response.output_text.delta","delta":"- id: 1\\n  text: 你好"}\n\n',
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"type":"response.output_text.delta","delta":"助手回复"}\n\n',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new ChatgptOauthService({
      model: "gpt-5.5",
      reasoningEffort: "max",
      reasoningEffortAssistant: "high",
    });
    const signal = new AbortController().signal;

    await service.translate(
      { texts: ["Hello"], from: "en", to: "zh-CN" },
      signal,
    );
    await service.completePrompt(
      { kind: "chat", text: "Hello", service: "chatgpt" },
      signal,
    );

    const translationBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    const assistantBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(translationBody.reasoning).toEqual({ effort: "xhigh" });
    expect(assistantBody.reasoning).toEqual({ effort: "high" });
  });

  it("refreshes once after a 401 and retries with the new token", async () => {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const oldAccess = jwt({
      exp: nowSeconds + 3_600,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-old" },
    });
    const newAccess = jwt({
      exp: nowSeconds + 3_600,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct-new" },
    });
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: storedTokens(oldAccess, "refresh-old"),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: newAccess,
            refresh_token: "refresh-new",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"type":"response.output_text.delta","delta":"- id: 1\\n  text: 你好"}\n\n',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const service = new ChatgptOauthService({ model: "gpt-5.4-mini" });
    await expect(
      service.translate(
        { texts: ["Hello"], from: "en", to: "zh-CN" },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ texts: ["你好"] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(thirdHeaders.Authorization).toBe(`Bearer ${newAccess}`);
    expect(thirdHeaders["ChatGPT-Account-ID"]).toBe("acct-new");
  });

  it("does not refresh twice after repeated 401 responses", async () => {
    const accessToken = jwt({ exp: Math.floor(Date.now() / 1_000) + 3_600 });
    const refreshedToken = jwt({
      exp: Math.floor(Date.now() / 1_000) + 3_600,
    });
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: storedTokens(accessToken),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: refreshedToken }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ChatgptOauthService({ model: "gpt-5.4-mini" });

    await expect(
      service.translate(
        { texts: ["Hello"], from: "en", to: "zh-CN" },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "AUTH" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps 429 with Retry-After to a rate-limit error", async () => {
    const accessToken = jwt({ exp: Math.floor(Date.now() / 1_000) + 3_600 });
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: storedTokens(accessToken),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 429,
            headers: { "Retry-After": "11" },
          }),
      ),
    );

    await expect(
      new ChatgptOauthService({ model: "gpt-5.4-mini" }).translate(
        { texts: ["Hello"], from: "en", to: "zh-CN" },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMIT",
      details: { status: 429, retryAfter: 11 },
    });
  });
});
