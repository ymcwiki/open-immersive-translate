import browser from "webextension-polyfill";

import type {
  ChatgptOauthAccount,
  ChatgptOauthStatus,
} from "../../../shared/messages";
import { TranslateError } from "../base";

export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CODEX_DEVICE_CODE_URL =
  "https://auth.openai.com/api/accounts/deviceauth/usercode";
export const CODEX_DEVICE_TOKEN_URL =
  "https://auth.openai.com/api/accounts/deviceauth/token";
export const CODEX_DEVICE_LOGIN_URL = "https://auth.openai.com/codex/device";
export const CODEX_DEVICE_REDIRECT_URL =
  "https://auth.openai.com/deviceauth/callback";
export const CHATGPT_AUTH_STORAGE_KEY = "chatgptOauthAuth";
export const CHATGPT_AUTH_ALARM = "chatgptOauth.poll";

const AUTH_CLAIM = "https://api.openai.com/auth";
const LOGIN_TIMEOUT_MS = 15 * 60 * 1_000;
const REFRESH_SKEW_SECONDS = 120;
const MAX_DEVICE_CODE_ATTEMPTS = 4;

export interface ChatgptOauthTokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  tokenType?: string;
  obtainedAt: number;
}

interface PendingLogin {
  deviceAuthId: string;
  userCode: string;
  intervalSeconds: number;
  startedAt: number;
  nextPollAt: number;
}

interface StoredAuthState {
  tokens?: ChatgptOauthTokens;
  pending?: PendingLogin;
  error?: { message: string; retryAfter?: number };
}

interface AuthDependencies {
  fetch: typeof fetch;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}

const defaultDependencies: AuthDependencies = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function dependencies(
  overrides: Partial<AuthDependencies> = {},
): AuthDependencies {
  return { ...defaultDependencies, ...overrides };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseStoredState(value: unknown): StoredAuthState {
  if (!isRecord(value)) return {};
  const result: StoredAuthState = {};
  if (isRecord(value.tokens)) {
    const accessToken = nonEmptyString(value.tokens.accessToken);
    const refreshToken = nonEmptyString(value.tokens.refreshToken);
    if (accessToken && refreshToken) {
      result.tokens = {
        accessToken,
        refreshToken,
        idToken: nonEmptyString(value.tokens.idToken),
        tokenType: nonEmptyString(value.tokens.tokenType),
        obtainedAt:
          typeof value.tokens.obtainedAt === "number"
            ? value.tokens.obtainedAt
            : 0,
      };
    }
  }
  if (isRecord(value.pending)) {
    const deviceAuthId = nonEmptyString(value.pending.deviceAuthId);
    const userCode = nonEmptyString(value.pending.userCode);
    if (deviceAuthId && userCode) {
      result.pending = {
        deviceAuthId,
        userCode,
        intervalSeconds:
          typeof value.pending.intervalSeconds === "number"
            ? Math.max(3, value.pending.intervalSeconds)
            : 5,
        startedAt:
          typeof value.pending.startedAt === "number"
            ? value.pending.startedAt
            : 0,
        nextPollAt:
          typeof value.pending.nextPollAt === "number"
            ? value.pending.nextPollAt
            : 0,
      };
    }
  }
  if (isRecord(value.error)) {
    const message = nonEmptyString(value.error.message);
    if (message) {
      result.error = {
        message,
        ...(typeof value.error.retryAfter === "number"
          ? { retryAfter: value.error.retryAfter }
          : {}),
      };
    }
  }
  return result;
}

async function readState(): Promise<StoredAuthState> {
  const stored = await browser.storage.local.get(CHATGPT_AUTH_STORAGE_KEY);
  return parseStoredState(stored[CHATGPT_AUTH_STORAGE_KEY]);
}

async function writeState(state: StoredAuthState): Promise<void> {
  await browser.storage.local.set({ [CHATGPT_AUTH_STORAGE_KEY]: state });
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
  );
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

/** Decode a JWT payload without verifying its signature. */
export function decodeJwtClaims(
  token: unknown,
): Record<string, unknown> | undefined {
  if (typeof token !== "string") return undefined;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return undefined;
  try {
    const claims: unknown = JSON.parse(decodeBase64Url(parts[1]));
    return isRecord(claims) ? claims : undefined;
  } catch {
    return undefined;
  }
}

export function decodeChatgptAccount(
  accessToken: string,
  idToken?: string,
): ChatgptOauthAccount {
  const accessClaims = decodeJwtClaims(accessToken) ?? {};
  const idClaims = decodeJwtClaims(idToken) ?? {};
  const authClaims = isRecord(accessClaims[AUTH_CLAIM])
    ? accessClaims[AUTH_CLAIM]
    : {};
  const accountId =
    nonEmptyString(authClaims.chatgpt_account_id) ??
    nonEmptyString(accessClaims.chatgpt_account_id);
  const planType =
    nonEmptyString(authClaims.chatgpt_plan_type) ??
    nonEmptyString(authClaims.plan_type) ??
    nonEmptyString(accessClaims.chatgpt_plan_type);
  const email =
    nonEmptyString(idClaims.email) ?? nonEmptyString(accessClaims.email);
  const exp = accessClaims.exp;
  return {
    ...(accountId ? { accountId } : {}),
    ...(email ? { email } : {}),
    ...(planType ? { planType } : {}),
    ...(typeof exp === "number" ? { expiresAt: exp * 1_000 } : {}),
  };
}

export function isAccessTokenExpiring(
  accessToken: unknown,
  now = Date.now(),
  skewSeconds = REFRESH_SKEW_SECONDS,
): boolean {
  const exp = decodeJwtClaims(accessToken)?.exp;
  return (
    typeof exp === "number" &&
    exp * 1_000 <= now + Math.max(0, skewSeconds) * 1_000
  );
}

function statusFromState(state: StoredAuthState): ChatgptOauthStatus {
  if (state.pending) {
    return {
      state: "pending",
      userCode: state.pending.userCode,
      verificationUrl: CODEX_DEVICE_LOGIN_URL,
      startedAt: state.pending.startedAt,
      expiresAt: state.pending.startedAt + LOGIN_TIMEOUT_MS,
      nextPollAt: state.pending.nextPollAt,
    };
  }
  if (state.tokens) {
    return {
      state: "authenticated",
      account: decodeChatgptAccount(
        state.tokens.accessToken,
        state.tokens.idToken,
      ),
    };
  }
  if (state.error) {
    return {
      state: "error",
      error: state.error.message,
      ...(state.error.retryAfter ? { retryAfter: state.error.retryAfter } : {}),
    };
  }
  return { state: "logged_out" };
}

async function schedulePoll(pending: PendingLogin): Promise<void> {
  await browser.alarms.create(CHATGPT_AUTH_ALARM, {
    when: Math.max(Date.now() + 250, pending.nextPollAt),
  });
}

async function clearPoll(): Promise<void> {
  await browser.alarms.clear(CHATGPT_AUTH_ALARM);
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? undefined
    : Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000));
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const value: unknown = await response.clone().json();
    if (isRecord(value)) {
      if (typeof value.error_description === "string") {
        return value.error_description;
      }
      if (typeof value.message === "string") return value.message;
      if (isRecord(value.error) && typeof value.error.message === "string") {
        return value.error.message;
      }
    }
  } catch {
    // Use the status-based fallback below.
  }
  return fallback;
}

async function storeError(
  message: string,
  tokens?: ChatgptOauthTokens,
  retryAfter?: number,
): Promise<ChatgptOauthStatus> {
  await clearPoll();
  const state: StoredAuthState = {
    ...(tokens ? { tokens } : {}),
    error: { message, ...(retryAfter ? { retryAfter } : {}) },
  };
  await writeState(state);
  return statusFromState(state);
}

export async function getChatgptOauthStatus(
  now = Date.now(),
): Promise<ChatgptOauthStatus> {
  const state = await readState();
  if (state.pending && now - state.pending.startedAt >= LOGIN_TIMEOUT_MS) {
    return storeError("登录已在 15 分钟后超时。", state.tokens);
  }
  return statusFromState(state);
}

export async function startChatgptOauth(
  overrides: Partial<AuthDependencies> = {},
): Promise<ChatgptOauthStatus> {
  const runtime = dependencies(overrides);
  const previous = await readState();
  await clearPoll();
  let response: Response | undefined;
  for (let attempt = 0; attempt < MAX_DEVICE_CODE_ATTEMPTS; attempt += 1) {
    try {
      response = await runtime.fetch(CODEX_DEVICE_CODE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: CODEX_OAUTH_CLIENT_ID }),
      });
    } catch (error) {
      return storeError(
        error instanceof Error ? error.message : "无法请求登录代码。",
        previous.tokens,
      );
    }
    if (response.status !== 429) break;
    if (attempt + 1 < MAX_DEVICE_CODE_ATTEMPTS) {
      const delaySeconds =
        retryAfterSeconds(response) ?? Math.min(60, 2 ** (attempt + 1));
      await runtime.sleep(Math.max(1, delaySeconds) * 1_000);
    }
  }

  if (!response || !response.ok) {
    const retryAfter = response ? retryAfterSeconds(response) : undefined;
    return storeError(
      response
        ? await responseMessage(
            response,
            `请求登录代码失败（HTTP ${response.status}）。`,
          )
        : "无法请求登录代码。",
      previous.tokens,
      retryAfter ? runtime.now() + retryAfter * 1_000 : undefined,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return storeError("登录代码响应不是有效 JSON。", previous.tokens);
  }
  const deviceAuthId = isRecord(payload)
    ? nonEmptyString(payload.device_auth_id)
    : undefined;
  const userCode = isRecord(payload)
    ? nonEmptyString(payload.user_code)
    : undefined;
  if (!deviceAuthId || !userCode) {
    return storeError("登录代码响应缺少必要字段。", previous.tokens);
  }
  const interval =
    isRecord(payload) && Number.isFinite(Number(payload.interval))
      ? Math.max(3, Number(payload.interval))
      : 5;
  const startedAt = runtime.now();
  const pending: PendingLogin = {
    deviceAuthId,
    userCode,
    intervalSeconds: interval,
    startedAt,
    nextPollAt: startedAt + interval * 1_000,
  };
  const state: StoredAuthState = {
    ...(previous.tokens ? { tokens: previous.tokens } : {}),
    pending,
  };
  await writeState(state);
  await schedulePoll(pending);
  return statusFromState(state);
}

async function exchangeAuthorizationCode(
  authorizationCode: string,
  codeVerifier: string,
  previous: StoredAuthState,
  runtime: AuthDependencies,
): Promise<ChatgptOauthStatus> {
  let response: Response;
  try {
    response = await runtime.fetch(CODEX_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: CODEX_DEVICE_REDIRECT_URL,
        client_id: CODEX_OAUTH_CLIENT_ID,
        code_verifier: codeVerifier,
      }).toString(),
    });
  } catch (error) {
    return storeError(
      error instanceof Error ? error.message : "令牌交换失败。",
      previous.tokens,
    );
  }
  if (!response.ok) {
    const retryAfter = retryAfterSeconds(response);
    return storeError(
      await responseMessage(
        response,
        `令牌交换失败（HTTP ${response.status}）。`,
      ),
      previous.tokens,
      retryAfter ? runtime.now() + retryAfter * 1_000 : undefined,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return storeError("令牌交换响应不是有效 JSON。", previous.tokens);
  }
  const accessToken = isRecord(payload)
    ? nonEmptyString(payload.access_token)
    : undefined;
  const refreshToken = isRecord(payload)
    ? nonEmptyString(payload.refresh_token)
    : undefined;
  if (!accessToken || !refreshToken) {
    return storeError("令牌交换响应缺少访问令牌或刷新令牌。", previous.tokens);
  }
  const tokens: ChatgptOauthTokens = {
    accessToken,
    refreshToken,
    idToken: isRecord(payload) ? nonEmptyString(payload.id_token) : undefined,
    tokenType: isRecord(payload)
      ? nonEmptyString(payload.token_type)
      : undefined,
    obtainedAt: runtime.now(),
  };
  await clearPoll();
  await writeState({ tokens });
  return statusFromState({ tokens });
}

export async function pollChatgptOauth(
  overrides: Partial<AuthDependencies> = {},
): Promise<ChatgptOauthStatus> {
  const runtime = dependencies(overrides);
  const state = await readState();
  const pending = state.pending;
  if (!pending) return statusFromState(state);
  if (runtime.now() - pending.startedAt >= LOGIN_TIMEOUT_MS) {
    return storeError("登录已在 15 分钟后超时。", state.tokens);
  }

  let response: Response;
  try {
    response = await runtime.fetch(CODEX_DEVICE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_auth_id: pending.deviceAuthId,
        user_code: pending.userCode,
      }),
    });
  } catch (error) {
    return storeError(
      error instanceof Error ? error.message : "登录状态查询失败。",
      state.tokens,
    );
  }

  if (response.status === 403 || response.status === 404) {
    pending.nextPollAt = runtime.now() + pending.intervalSeconds * 1_000;
    await writeState({ ...state, pending, error: undefined });
    await schedulePoll(pending);
    return statusFromState({ ...state, pending, error: undefined });
  }
  if (response.status === 429) {
    const delaySeconds = retryAfterSeconds(response) ?? pending.intervalSeconds;
    pending.nextPollAt = runtime.now() + Math.max(1, delaySeconds) * 1_000;
    await writeState({ ...state, pending, error: undefined });
    await schedulePoll(pending);
    return statusFromState({ ...state, pending, error: undefined });
  }
  if (!response.ok) {
    return storeError(
      await responseMessage(
        response,
        `登录状态查询失败（HTTP ${response.status}）。`,
      ),
      state.tokens,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return storeError("登录状态响应不是有效 JSON。", state.tokens);
  }
  const authorizationCode = isRecord(payload)
    ? nonEmptyString(payload.authorization_code)
    : undefined;
  const codeVerifier = isRecord(payload)
    ? nonEmptyString(payload.code_verifier)
    : undefined;
  if (!authorizationCode || !codeVerifier) {
    return storeError("登录状态响应缺少授权代码或校验码。", state.tokens);
  }
  return exchangeAuthorizationCode(
    authorizationCode,
    codeVerifier,
    state,
    runtime,
  );
}

export async function cancelChatgptOauth(): Promise<ChatgptOauthStatus> {
  const state = await readState();
  await clearPoll();
  const next = state.tokens ? { tokens: state.tokens } : {};
  await writeState(next);
  return statusFromState(next);
}

export async function logoutChatgptOauth(): Promise<ChatgptOauthStatus> {
  await clearPoll();
  await browser.storage.local.remove(CHATGPT_AUTH_STORAGE_KEY);
  return { state: "logged_out" };
}

export async function refreshChatgptOauthTokens(
  overrides: Partial<AuthDependencies> = {},
): Promise<ChatgptOauthTokens> {
  const runtime = dependencies(overrides);
  const state = await readState();
  const tokens = state.tokens;
  if (!tokens?.refreshToken) {
    throw new TranslateError("auth", "请先登录 ChatGPT。", {
      serviceId: "chatgpt",
      retryable: false,
    });
  }
  let response: Response;
  try {
    response = await runtime.fetch(CODEX_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: CODEX_OAUTH_CLIENT_ID,
      }).toString(),
    });
  } catch (error) {
    throw new TranslateError("network", "ChatGPT 令牌刷新失败。", {
      serviceId: "chatgpt",
      cause: error,
    });
  }
  if (response.status === 429) {
    const retryAfter = retryAfterSeconds(response);
    throw new TranslateError("rate_limit", "ChatGPT 令牌刷新受到限流。", {
      serviceId: "chatgpt",
      details: {
        status: 429,
        ...(retryAfter !== undefined ? { retryAfter } : {}),
      },
    });
  }
  if (!response.ok) {
    throw new TranslateError(
      "auth",
      await responseMessage(
        response,
        `ChatGPT 令牌刷新失败（HTTP ${response.status}）。`,
      ),
      {
        serviceId: "chatgpt",
        retryable: false,
        details: { status: response.status },
      },
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new TranslateError("parse", "ChatGPT 令牌刷新响应不是有效 JSON。", {
      serviceId: "chatgpt",
      retryable: false,
      cause: error,
    });
  }
  const accessToken = isRecord(payload)
    ? nonEmptyString(payload.access_token)
    : undefined;
  if (!accessToken) {
    throw new TranslateError("auth", "ChatGPT 令牌刷新响应缺少访问令牌。", {
      serviceId: "chatgpt",
      retryable: false,
    });
  }
  const refreshed: ChatgptOauthTokens = {
    accessToken,
    refreshToken:
      (isRecord(payload) && nonEmptyString(payload.refresh_token)) ||
      tokens.refreshToken,
    idToken:
      (isRecord(payload) && nonEmptyString(payload.id_token)) || tokens.idToken,
    tokenType:
      (isRecord(payload) && nonEmptyString(payload.token_type)) ||
      tokens.tokenType,
    obtainedAt: runtime.now(),
  };
  await writeState({ tokens: refreshed });
  return refreshed;
}

export async function getValidChatgptOauthTokens(
  overrides: Partial<AuthDependencies> = {},
): Promise<ChatgptOauthTokens> {
  const runtime = dependencies(overrides);
  const tokens = (await readState()).tokens;
  if (!tokens) {
    throw new TranslateError("auth", "请先登录 ChatGPT。", {
      serviceId: "chatgpt",
      retryable: false,
    });
  }
  return isAccessTokenExpiring(tokens.accessToken, runtime.now())
    ? refreshChatgptOauthTokens(runtime)
    : tokens;
}

export async function importCodexCliAuth(
  json: string,
  now = Date.now(),
): Promise<ChatgptOauthStatus> {
  let payload: unknown;
  try {
    payload = JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new TranslateError(
      "invalid_config",
      "Codex CLI auth.json 不是有效 JSON。",
      {
        serviceId: "chatgpt",
        retryable: false,
        cause: error,
      },
    );
  }
  const rawTokens =
    isRecord(payload) && isRecord(payload.tokens) ? payload.tokens : undefined;
  const accessToken = rawTokens
    ? nonEmptyString(rawTokens.access_token)
    : undefined;
  const refreshToken = rawTokens
    ? nonEmptyString(rawTokens.refresh_token)
    : undefined;
  if (!accessToken || !refreshToken) {
    throw new TranslateError(
      "invalid_config",
      "Codex CLI auth.json 缺少 tokens.access_token 或 tokens.refresh_token。",
      { serviceId: "chatgpt", retryable: false },
    );
  }
  if (isAccessTokenExpiring(accessToken, now, 0)) {
    throw new TranslateError("auth", "Codex CLI 访问令牌已过期。", {
      serviceId: "chatgpt",
      retryable: false,
    });
  }
  const tokens: ChatgptOauthTokens = {
    accessToken,
    refreshToken,
    idToken: rawTokens ? nonEmptyString(rawTokens.id_token) : undefined,
    tokenType: "Bearer",
    obtainedAt: now,
  };
  await clearPoll();
  await writeState({ tokens });
  return statusFromState({ tokens });
}

export async function resumeChatgptOauthPolling(): Promise<void> {
  const state = await readState();
  if (!state.pending) return;
  if (Date.now() - state.pending.startedAt >= LOGIN_TIMEOUT_MS) {
    await storeError("登录已在 15 分钟后超时。", state.tokens);
    return;
  }
  await schedulePoll(state.pending);
}

export function registerChatgptOauthPolling(): () => void {
  const onAlarm = (alarm: browser.Alarms.Alarm): void => {
    if (alarm.name === CHATGPT_AUTH_ALARM) {
      void pollChatgptOauth().catch(console.error);
    }
  };
  const onStartup = (): void => {
    void resumeChatgptOauthPolling().catch(console.error);
  };
  browser.alarms.onAlarm.addListener(onAlarm);
  browser.runtime.onStartup.addListener(onStartup);
  void resumeChatgptOauthPolling().catch(console.error);
  return () => {
    browser.alarms.onAlarm.removeListener(onAlarm);
    browser.runtime.onStartup.removeListener(onStartup);
  };
}
