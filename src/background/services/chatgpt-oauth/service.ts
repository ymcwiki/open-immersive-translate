import browser from "webextension-polyfill";

import type { AssistantRequest } from "../../../shared/k-assistant";
import type { RateLimit, TranslateRequest } from "../../../shared/types";
import { assistantConversation, assistantInstruction } from "../assistant";
import {
  BaseService,
  type ServiceTranslateResult,
  type TranslationStreamOptions,
  TranslateError,
  fetchWithTimeout,
  responseError,
} from "../base";
import {
  buildRefusalPatterns,
  buildYamlBatch,
  matchesRefusal,
  parseYamlBatch,
} from "../openai-compatible";
import {
  DEFAULT_PROMPTS,
  renderPromptTemplate,
  requestPromptVariant,
} from "../prompts";
import { readSse } from "../stream";
import {
  decodeChatgptAccount,
  getValidChatgptOauthTokens,
  refreshChatgptOauthTokens,
  type ChatgptOauthTokens,
} from "./auth";

export const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
export const CODEX_RESPONSES_URL = `${CODEX_BASE_URL}/responses`;
export const CODEX_MODELS_URL = `${CODEX_BASE_URL}/models?client_version=1.0.0`;
export const CHATGPT_MODELS_STORAGE_KEY = "chatgptOauthModels";
export const DEFAULT_CHATGPT_MODEL = "gpt-5.4-mini";
export const CHATGPT_FALLBACK_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4-mini",
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
] as const;

const MODEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export interface ChatgptServiceOptions {
  model?: string;
  prompt?: string;
  promptSystem?: string;
  promptUser?: string;
  ignoreResRegexs?: string[];
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface ModelCache {
  models: string[];
  fetchedAt: number;
}

interface CodexEvent {
  type?: unknown;
  delta?: unknown;
  message?: unknown;
  error?: unknown;
  response?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionVersion(): string {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return "0.0.0";
  }
}

/** Required identity and account headers for the ChatGPT Codex backend. */
export function buildChatgptHeaders(
  tokens: Pick<ChatgptOauthTokens, "accessToken" | "idToken">,
): Record<string, string> {
  const accountId = decodeChatgptAccount(
    tokens.accessToken,
    tokens.idToken,
  ).accountId;
  return {
    Authorization: `Bearer ${tokens.accessToken}`,
    ...(accountId ? { "ChatGPT-Account-ID": accountId } : {}),
    originator: "bilingual-translator",
    "User-Agent": `bilingual-translator/${extensionVersion()}`,
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  };
}

function parseModelCache(value: unknown): ModelCache | undefined {
  if (!isRecord(value) || !Array.isArray(value.models)) return undefined;
  const models = value.models.filter(
    (model): model is string => typeof model === "string" && Boolean(model),
  );
  return models.length && typeof value.fetchedAt === "number"
    ? { models, fetchedAt: value.fetchedAt }
    : undefined;
}

function parseModels(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.models)) return [];
  return value.models
    .flatMap((item) => {
      if (!isRecord(item) || typeof item.slug !== "string") return [];
      const visibility =
        typeof item.visibility === "string"
          ? item.visibility.toLowerCase()
          : "";
      if (visibility === "hide" || visibility === "hidden") return [];
      return [
        {
          slug: item.slug.trim(),
          priority: typeof item.priority === "number" ? item.priority : 10_000,
        },
      ];
    })
    .filter(({ slug }) => Boolean(slug))
    .sort((left, right) =>
      left.priority === right.priority
        ? left.slug.localeCompare(right.slug)
        : left.priority - right.priority,
    )
    .map(({ slug }) => slug)
    .filter((slug, index, values) => values.indexOf(slug) === index);
}

export function selectDefaultChatgptModel(models: readonly string[]): string {
  return (
    models.find(
      (model) =>
        /^gpt-5(?:\.|-)/.test(model) &&
        model.includes("mini") &&
        !model.includes("codex"),
    ) ?? DEFAULT_CHATGPT_MODEL
  );
}

export async function getChatgptModels(
  force = false,
): Promise<readonly string[]> {
  const now = Date.now();
  const stored = await browser.storage.local.get(CHATGPT_MODELS_STORAGE_KEY);
  const cached = parseModelCache(stored[CHATGPT_MODELS_STORAGE_KEY]);
  if (!force && cached && now - cached.fetchedAt < MODEL_CACHE_MAX_AGE_MS) {
    return cached.models;
  }

  try {
    const tokens = await getValidChatgptOauthTokens();
    const response = await fetch(CODEX_MODELS_URL, {
      headers: {
        ...buildChatgptHeaders(tokens),
        Accept: "application/json",
      },
    });
    if (response.ok) {
      const models = parseModels(await response.json());
      if (models.length) {
        await browser.storage.local.set({
          [CHATGPT_MODELS_STORAGE_KEY]: { models, fetchedAt: now },
        });
        return models;
      }
    }
  } catch {
    // A cached or static catalog keeps translation usable during probe errors.
  }
  return cached?.models ?? CHATGPT_FALLBACK_MODELS;
}

function codexEventError(event: CodexEvent): string {
  if (typeof event.message === "string") return event.message;
  if (isRecord(event.error) && typeof event.error.message === "string") {
    return event.error.message;
  }
  if (isRecord(event.response) && isRecord(event.response.error)) {
    const error = event.response.error;
    if (typeof error.message === "string") return error.message;
  }
  return "ChatGPT 流式响应返回错误。";
}

/** Extract one output-text delta or throw for a terminal SSE error event. */
export function parseCodexSseEvent(
  data: string,
  eventType?: string,
): string | undefined {
  let event: CodexEvent;
  try {
    event = JSON.parse(data) as CodexEvent;
  } catch (error) {
    throw new TranslateError("parse", "ChatGPT 流式响应不是有效 JSON。", {
      serviceId: "chatgpt",
      retryable: false,
      cause: error,
    });
  }
  const type = typeof event.type === "string" ? event.type : eventType;
  if (type === "response.output_text.delta") {
    if (typeof event.delta === "string") return event.delta;
    throw new TranslateError("parse", "ChatGPT 流式响应缺少文本增量。", {
      serviceId: "chatgpt",
      retryable: false,
    });
  }
  if (type === "error" || type === "response.failed") {
    throw new TranslateError("network", codexEventError(event), {
      serviceId: "chatgpt",
      retryable: false,
    });
  }
  return undefined;
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

async function codexResponseError(response: Response): Promise<TranslateError> {
  if (response.status === 429) {
    const retryAfter = retryAfterSeconds(response);
    return new TranslateError("rate_limit", "ChatGPT 请求受到限流。", {
      serviceId: "chatgpt",
      details: {
        status: 429,
        ...(retryAfter !== undefined ? { retryAfter } : {}),
      },
    });
  }
  return responseError(response, "chatgpt");
}

export class ChatgptOauthService extends BaseService {
  private readonly model?: string;
  private readonly promptSystem?: string;
  private readonly promptUser?: string;
  private readonly timeoutMs: number;
  private readonly refusalPatterns: RegExp[];
  readonly onPartial: (
    request: AssistantRequest,
    emitCumulativeText: (text: string) => void,
    signal: AbortSignal,
  ) => Promise<string>;

  constructor(options: ChatgptServiceOptions = {}) {
    super({
      id: "chatgpt",
      name: "ChatGPT 账号（OAuth）",
      maxBatchSize: options.maxBatchSize ?? 20,
      maxBatchChars: options.maxBatchChars ?? 12_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 2,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.model = options.model;
    this.promptSystem = options.promptSystem ?? options.prompt;
    this.promptUser = options.promptUser;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.refusalPatterns = buildRefusalPatterns(options.ignoreResRegexs);
    this.onPartial = (request, emitCumulativeText, signal) =>
      this.runAssistant(request, signal, { onPartial: emitCumulativeText });
  }

  private async selectedModel(): Promise<string> {
    return this.model || selectDefaultChatgptModel(await getChatgptModels());
  }

  private async request(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Response> {
    let tokens = await getValidChatgptOauthTokens();
    let response = await fetchWithTimeout(
      CODEX_RESPONSES_URL,
      {
        method: "POST",
        headers: buildChatgptHeaders(tokens),
        body: JSON.stringify(body),
      },
      signal,
      this.timeoutMs,
      this.id,
    );
    if (response.status === 401) {
      tokens = await refreshChatgptOauthTokens();
      response = await fetchWithTimeout(
        CODEX_RESPONSES_URL,
        {
          method: "POST",
          headers: buildChatgptHeaders(tokens),
          body: JSON.stringify(body),
        },
        signal,
        this.timeoutMs,
        this.id,
      );
    }
    if (!response.ok) throw await codexResponseError(response);
    return response;
  }

  private async streamResponse(
    body: Record<string, unknown>,
    signal: AbortSignal,
    options?: TranslationStreamOptions,
  ): Promise<string> {
    return readSse(
      await this.request(body, signal),
      this.id,
      parseCodexSseEvent,
      options,
    );
  }

  private async runAssistant(
    request: AssistantRequest,
    signal: AbortSignal,
    options?: TranslationStreamOptions,
  ): Promise<string> {
    const input = assistantConversation(request).map((message) => ({
      role: message.role,
      content: [
        {
          type: message.role === "assistant" ? "output_text" : "input_text",
          text: message.content,
        },
      ],
    }));
    return this.streamResponse(
      {
        model: await this.selectedModel(),
        instructions: assistantInstruction(request),
        input,
        store: false,
        stream: true,
      },
      signal,
      options,
    );
  }

  completePrompt(
    request: AssistantRequest,
    signal: AbortSignal,
  ): Promise<string> {
    return this.runAssistant(request, signal);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
    options?: TranslationStreamOptions,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const batch = buildYamlBatch(request.texts);
    const templates = DEFAULT_PROMPTS[requestPromptVariant(request)];
    const content = await this.streamResponse(
      {
        model: await this.selectedModel(),
        instructions: renderPromptTemplate(
          this.promptSystem ?? templates.system,
          request,
          batch,
        ),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: renderPromptTemplate(
                  this.promptUser ?? templates.user,
                  request,
                  batch,
                ),
              },
            ],
          },
        ],
        store: false,
        stream: true,
      },
      signal,
      options,
    );
    if (matchesRefusal(content, this.refusalPatterns)) {
      throw new TranslateError(
        "refused",
        "Translation response matched a refusal pattern.",
        { serviceId: this.id, retryable: false },
      );
    }

    const byId = parseYamlBatch(content);
    const texts: string[] = [];
    const errors: Array<TranslateError | undefined> = [];
    for (let index = 0; index < request.texts.length; index += 1) {
      const text = byId.get(index + 1);
      if (text === undefined) {
        texts.push("");
        errors.push(
          new TranslateError(
            "parse",
            `Translation response is missing id ${index + 1}.`,
            { serviceId: this.id, retryable: false },
          ),
        );
      } else {
        texts.push(text);
        errors.push(undefined);
      }
    }
    return {
      texts,
      ...(errors.some(Boolean) ? { errors } : {}),
    };
  }
}
