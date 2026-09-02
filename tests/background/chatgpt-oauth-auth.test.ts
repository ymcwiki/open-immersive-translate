import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ stored: {} as Record<string, unknown> }));
const alarmListeners = vi.hoisted(
  () => new Set<(alarm: { name: string }) => void>(),
);
const startupListeners = vi.hoisted(() => new Set<() => void>());
const browserMock = vi.hoisted(() => ({
  alarms: {
    create: vi.fn(async () => undefined),
    clear: vi.fn(async () => true),
    onAlarm: {
      addListener: vi.fn((listener: (alarm: { name: string }) => void) =>
        alarmListeners.add(listener),
      ),
      removeListener: vi.fn((listener: (alarm: { name: string }) => void) =>
        alarmListeners.delete(listener),
      ),
    },
  },
  runtime: {
    onStartup: {
      addListener: vi.fn((listener: () => void) =>
        startupListeners.add(listener),
      ),
      removeListener: vi.fn((listener: () => void) =>
        startupListeners.delete(listener),
      ),
    },
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

import {
  CHATGPT_AUTH_ALARM,
  CHATGPT_AUTH_STORAGE_KEY,
  CODEX_DEVICE_CODE_URL,
  CODEX_DEVICE_TOKEN_URL,
  CODEX_OAUTH_TOKEN_URL,
  decodeChatgptAccount,
  decodeJwtClaims,
  getChatgptOauthStatus,
  importCodexCliAuth,
  isAccessTokenExpiring,
  pollChatgptOauth,
  registerChatgptOauthPolling,
  refreshChatgptOauthTokens,
  startChatgptOauth,
} from "../../src/background/services/chatgpt-oauth/auth";

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode(payload)}.`;
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function pendingState(now = 1_800_000_000_000): Record<string, unknown> {
  return {
    pending: {
      deviceAuthId: "device-1",
      userCode: "ABCD-EFGH",
      intervalSeconds: 5,
      startedAt: now,
      nextPollAt: now + 5_000,
    },
  };
}

beforeEach(() => {
  state.stored = {};
  alarmListeners.clear();
  startupListeners.clear();
  vi.clearAllMocks();
});

describe("ChatGPT OAuth device flow", () => {
  it("starts, polls, exchanges, and stores a successful login", async () => {
    const now = 1_800_000_000_000;
    const accessToken = jwt({
      exp: now / 1_000 + 3_600,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-1",
        chatgpt_plan_type: "plus",
      },
    });
    const fetchStart = vi.fn(async () =>
      jsonResponse({
        user_code: "ABCD-EFGH",
        device_auth_id: "device-1",
        interval: 5,
      }),
    );

    await expect(
      startChatgptOauth({ fetch: fetchStart, now: () => now }),
    ).resolves.toMatchObject({
      state: "pending",
      userCode: "ABCD-EFGH",
    });
    expect(fetchStart).toHaveBeenCalledWith(
      CODEX_DEVICE_CODE_URL,
      expect.objectContaining({ method: "POST" }),
    );
    expect(browserMock.alarms.create).toHaveBeenCalledWith(CHATGPT_AUTH_ALARM, {
      when: now + 5_000,
    });

    const fetchPoll = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_code: "authorization-code",
          code_verifier: "verifier",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: accessToken,
          refresh_token: "refresh-1",
          id_token: jwt({ email: "reader@example.com" }),
        }),
      );
    const result = await pollChatgptOauth({ fetch: fetchPoll, now: () => now });

    expect(result).toEqual({
      state: "authenticated",
      account: {
        accountId: "acct-1",
        email: "reader@example.com",
        planType: "plus",
        expiresAt: now + 3_600_000,
      },
    });
    expect(fetchPoll.mock.calls.map(([url]) => url)).toEqual([
      CODEX_DEVICE_TOKEN_URL,
      CODEX_OAUTH_TOKEN_URL,
    ]);
    expect(state.stored[CHATGPT_AUTH_STORAGE_KEY]).toMatchObject({
      tokens: {
        accessToken,
        refreshToken: "refresh-1",
      },
    });
  });

  it.each([403, 404])("keeps polling while status is %s", async (status) => {
    const now = 1_800_000_000_000;
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = pendingState(now);
    const result = await pollChatgptOauth({
      fetch: vi.fn(async () => new Response(null, { status })),
      now: () => now + 1_000,
    });

    expect(result).toMatchObject({ state: "pending", userCode: "ABCD-EFGH" });
    expect(browserMock.alarms.create).toHaveBeenCalledWith(CHATGPT_AUTH_ALARM, {
      when: now + 6_000,
    });
  });

  it("backs off and retries a rate-limited device-code request", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "7" }))
      .mockResolvedValueOnce(
        jsonResponse({
          user_code: "ABCD-EFGH",
          device_auth_id: "device-1",
          interval: 5,
        }),
      );

    await expect(
      startChatgptOauth({ fetch: fetchMock, sleep }),
    ).resolves.toMatchObject({ state: "pending" });
    expect(sleep).toHaveBeenCalledWith(7_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stores an exchange error instead of credentials", async () => {
    const now = 1_800_000_000_000;
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = pendingState(now);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          authorization_code: "authorization-code",
          code_verifier: "verifier",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error_description: "invalid exchange" }, 400),
      );

    await expect(
      pollChatgptOauth({ fetch: fetchMock, now: () => now }),
    ).resolves.toEqual({ state: "error", error: "invalid exchange" });
  });
});

describe("ChatGPT OAuth tokens", () => {
  it("decodes account claims and applies the 120-second expiry skew", () => {
    const now = 1_800_000_000_000;
    const token = jwt({
      exp: now / 1_000 + 100,
      email: "access@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-2",
        chatgpt_plan_type: "pro",
      },
    });

    expect(decodeJwtClaims(token)?.exp).toBe(now / 1_000 + 100);
    expect(decodeChatgptAccount(token)).toEqual({
      accountId: "acct-2",
      email: "access@example.com",
      planType: "pro",
      expiresAt: now + 100_000,
    });
    expect(isAccessTokenExpiring(token, now)).toBe(true);
    expect(isAccessTokenExpiring(token, now, 90)).toBe(false);
    expect(isAccessTokenExpiring("not-a-jwt", now)).toBe(false);
  });

  it("refreshes and stores rotated tokens", async () => {
    const now = 1_800_000_000_000;
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: {
        accessToken: jwt({ exp: now / 1_000 - 1 }),
        refreshToken: "refresh-old",
        obtainedAt: now - 1_000,
      },
    };
    const accessToken = jwt({ exp: now / 1_000 + 3_600 });
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        access_token: accessToken,
        refresh_token: "refresh-new",
      }),
    );

    await expect(
      refreshChatgptOauthTokens({ fetch: fetchMock, now: () => now }),
    ).resolves.toMatchObject({
      accessToken,
      refreshToken: "refresh-new",
      obtainedAt: now,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(init.body)).toContain("grant_type=refresh_token");
  });

  it("classifies refresh failures", async () => {
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = {
      tokens: {
        accessToken: jwt({ exp: 1 }),
        refreshToken: "refresh-old",
        obtainedAt: 0,
      },
    };

    await expect(
      refreshChatgptOauthTokens({
        fetch: vi.fn(async () => jsonResponse({}, 401)),
      }),
    ).rejects.toMatchObject({ code: "AUTH", retryable: false });
    await expect(
      refreshChatgptOauthTokens({
        fetch: vi.fn(async () => jsonResponse({}, 429, { "Retry-After": "9" })),
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMIT",
      details: { status: 429, retryAfter: 9 },
    });
  });

  it("imports valid Codex CLI JSON and rejects invalid or expired input", async () => {
    const now = 1_800_000_000_000;
    const accessToken = jwt({ exp: now / 1_000 + 3_600 });
    await expect(
      importCodexCliAuth(
        JSON.stringify({
          tokens: {
            access_token: accessToken,
            refresh_token: "refresh-cli",
            account_id: "ignored-account-field",
          },
        }),
        now,
      ),
    ).resolves.toMatchObject({ state: "authenticated" });
    await expect(importCodexCliAuth("not json", now)).rejects.toMatchObject({
      code: "INVALID_CONFIG",
    });
    await expect(
      importCodexCliAuth(
        JSON.stringify({
          tokens: {
            access_token: jwt({ exp: now / 1_000 - 1 }),
            refresh_token: "refresh-cli",
          },
        }),
        now,
      ),
    ).rejects.toMatchObject({ code: "AUTH" });
  });

  it("times out a persisted pending login after 15 minutes", async () => {
    const startedAt = 1_800_000_000_000;
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = pendingState(startedAt);
    await expect(
      getChatgptOauthStatus(startedAt + 15 * 60 * 1_000),
    ).resolves.toMatchObject({ state: "error" });
  });

  it("registers a persistent alarm listener and resumes stored polling", async () => {
    state.stored[CHATGPT_AUTH_STORAGE_KEY] = pendingState(Date.now());
    const dispose = registerChatgptOauthPolling();
    await vi.waitFor(() =>
      expect(browserMock.alarms.create).toHaveBeenCalled(),
    );

    expect(alarmListeners.size).toBe(1);
    expect(startupListeners.size).toBe(1);
    dispose();
    expect(alarmListeners.size).toBe(0);
    expect(startupListeners.size).toBe(0);
  });
});
