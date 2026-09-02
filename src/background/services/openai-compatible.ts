import type { RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  type TranslationStreamOptions,
  TranslateError,
  fetchWithTimeout,
  parseJsonResponse,
  responseError,
} from "./base";
import {
  DEFAULT_PROMPTS,
  renderPromptTemplate,
  requestPromptVariant,
} from "./prompts";
import { readSse } from "./stream";

export const DEFAULT_SYSTEM_PROMPT = DEFAULT_PROMPTS.default.system;
export const DEFAULT_USER_PROMPT = DEFAULT_PROMPTS.default.user;

const DEFAULT_REFUSAL_PATTERNS = [
  String.raw`抱歉[^\n]*(?:无法|不能)[^\n]*翻译`,
  String.raw`sorry[^\n]*(?:cannot|can't|unable to)[^\n]*translat`,
  String.raw`I (?:cannot|can't|am unable to) (?:assist|translate)`,
];

export interface OpenAICompatibleServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  apiPath?: string;
  model?: string;
  prompt?: string;
  promptSystem?: string;
  promptUser?: string;
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  extraHeaders?: Record<string, string>;
  ignoreResRegexs?: string[];
  timeoutMs?: number;
  stream?: boolean;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function compileRegex(pattern: string): RegExp {
  const literal = pattern.match(/^\/(.*)\/([dgimsuvy]*)$/);
  try {
    return literal
      ? new RegExp(literal[1], literal[2])
      : new RegExp(pattern, "i");
  } catch (error) {
    throw new TranslateError(
      "invalid_config",
      `Invalid refusal regex: ${pattern}`,
      {
        retryable: false,
        cause: error,
      },
    );
  }
}

export function buildRefusalPatterns(
  customPatterns: readonly string[] = [],
): RegExp[] {
  return [...DEFAULT_REFUSAL_PATTERNS, ...customPatterns].map(compileRegex);
}

export function matchesRefusal(
  content: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

/** Encode an ordered request as a YAML list with stable one-based ids. */
export function buildYamlBatch(texts: readonly string[]): string {
  return texts
    .map((text, index) => `- id: ${index + 1}\n  text: ${yamlScalar(text)}`)
    .join("\n");
}

function parseInlineValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function stripIndent(lines: string[]): string[] {
  const nonEmpty = lines.filter((line) => line.trim());
  const indent = nonEmpty.length
    ? Math.min(...nonEmpty.map((line) => line.match(/^\s*/)?.[0].length ?? 0))
    : 0;
  return lines.map((line) => line.slice(Math.min(indent, line.length)));
}

/** Parse the small YAML subset requested from LLM adapters. */
export function parseYamlBatch(content: string): Map<number, string> {
  const lines = content
    .replace(/^\s*```(?:ya?ml)?\s*\r?\n?/i, "")
    .replace(/\r?\n?\s*```\s*$/i, "")
    .split(/\r?\n/);
  const items: Array<{ id: number; body: string[] }> = [];

  for (const line of lines) {
    const item = line.match(/^\s*-\s*id\s*:\s*["']?(\d+)["']?\s*$/i);
    if (item) {
      items.push({ id: Number(item[1]), body: [] });
    } else if (items.length) {
      items.at(-1)?.body.push(line);
    }
  }

  const parsed = new Map<number, string>();
  for (const item of items) {
    const textLine = item.body.findIndex((line) => /^\s*text\s*:/i.test(line));
    if (textLine < 0 || parsed.has(item.id)) continue;

    const match = item.body[textLine]?.match(/^\s*text\s*:\s*(.*)$/i);
    if (!match) continue;
    const marker = match[1].trim();
    if (/^[>|][+-]?$/.test(marker)) {
      const block = stripIndent(item.body.slice(textLine + 1));
      parsed.set(
        item.id,
        marker.startsWith(">")
          ? block.join(" ").replace(/\s+/g, " ").trim()
          : block.join("\n").replace(/\n+$/, ""),
      );
      continue;
    }

    const continuation = stripIndent(item.body.slice(textLine + 1));
    const first = parseInlineValue(marker);
    parsed.set(
      item.id,
      continuation.length ? [first, ...continuation].join("\n") : first,
    );
  }
  return parsed;
}

/** Fill the supported prompt variables for backward-compatible callers. */
export function renderSystemPrompt(
  template: string,
  request: TranslateRequest,
): string {
  return renderPromptTemplate(template, request, "");
}

function joinUrl(baseUrl: string, apiPath: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${apiPath.replace(/^\/+/, "")}`;
}

/** OpenAI-compatible chat-completions adapter. */
export class OpenAICompatibleService extends BaseService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly apiPath: string;
  private readonly model: string;
  private readonly promptSystem?: string;
  private readonly promptUser?: string;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly headers: Record<string, string>;
  private readonly refusalPatterns: RegExp[];
  private readonly timeoutMs: number;
  private readonly stream: boolean;

  constructor(options: OpenAICompatibleServiceOptions = {}) {
    super({
      id: options.id ?? "openai-compatible",
      name: options.name ?? "OpenAI Compatible",
      maxBatchSize: options.maxBatchSize ?? 20,
      maxBatchChars: options.maxBatchChars ?? 12_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 2,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.apiPath = options.apiPath ?? "/chat/completions";
    this.model = options.model ?? "gpt-4o-mini";
    this.promptSystem = options.promptSystem ?? options.prompt;
    this.promptUser = options.promptUser;
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens;
    this.headers = { ...options.headers, ...options.extraHeaders };
    this.refusalPatterns = buildRefusalPatterns(options.ignoreResRegexs);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.stream = options.stream ?? false;
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
    options?: TranslationStreamOptions,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.headers,
    };
    const batch = buildYamlBatch(request.texts);
    const variant = requestPromptVariant(request);
    const templates = DEFAULT_PROMPTS[variant];
    const body = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: renderPromptTemplate(
            this.promptSystem ?? templates.system,
            request,
            batch,
          ),
        },
        {
          role: "user",
          content: renderPromptTemplate(
            this.promptUser ?? templates.user,
            request,
            batch,
          ),
        },
      ],
      ...(this.stream ? { stream: true } : {}),
      ...(this.temperature !== undefined
        ? { temperature: this.temperature }
        : {}),
      ...(this.maxTokens !== undefined ? { max_tokens: this.maxTokens } : {}),
    };
    const response = await fetchWithTimeout(
      joinUrl(this.baseUrl, this.apiPath),
      { method: "POST", headers, body: JSON.stringify(body) },
      signal,
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw await responseError(response, this.id);

    let data: OpenAIResponse = {};
    let content: unknown;
    if (this.stream) {
      content = await readSse(
        response,
        this.id,
        (event) => {
          try {
            const chunk = JSON.parse(event) as {
              choices?: Array<{ delta?: { content?: unknown } }>;
            };
            const delta = chunk.choices?.[0]?.delta?.content;
            return typeof delta === "string" ? delta : undefined;
          } catch (error) {
            throw new TranslateError(
              "parse",
              "OpenAI stream returned invalid JSON.",
              {
                serviceId: this.id,
                retryable: false,
                cause: error,
              },
            );
          }
        },
        options,
      );
    } else {
      data = (await parseJsonResponse(response, this.id)) as OpenAIResponse;
      content = data.choices?.[0]?.message?.content;
    }
    if (typeof content !== "string") {
      throw new TranslateError(
        "parse",
        "OpenAI response is missing message content.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }

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
      ...(data.usage
        ? {
            usage: {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
            },
          }
        : {}),
    };
  }
}
