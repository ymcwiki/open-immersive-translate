import type { RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
  fetchWithTimeout,
  parseJsonResponse,
  responseError,
} from "./base";
import {
  buildRefusalPatterns,
  buildYamlBatch,
  DEFAULT_SYSTEM_PROMPT,
  matchesRefusal,
  parseYamlBatch,
  renderSystemPrompt,
} from "./openai-compatible";

export interface ClaudeServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  apiPath?: string;
  model?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  ignoreResRegexs?: string[];
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface ClaudeResponse {
  content?: Array<{ type?: string; text?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Anthropic Claude Messages API adapter. */
export class ClaudeService extends BaseService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly apiPath: string;
  private readonly model: string;
  private readonly prompt: string;
  private readonly temperature?: number;
  private readonly maxTokens: number;
  private readonly headers: Record<string, string>;
  private readonly refusalPatterns: RegExp[];
  private readonly timeoutMs: number;

  constructor(options: ClaudeServiceOptions = {}) {
    super({
      id: options.id ?? "claude",
      name: options.name ?? "Claude",
      maxBatchSize: options.maxBatchSize ?? 20,
      maxBatchChars: options.maxBatchChars ?? 12_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 2,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
    this.apiPath = options.apiPath ?? "/messages";
    this.model = options.model ?? "claude-3-5-sonnet-latest";
    this.prompt = options.prompt ?? DEFAULT_SYSTEM_PROMPT;
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens ?? 4096;
    this.headers = options.headers ?? {};
    this.refusalPatterns = buildRefusalPatterns(options.ignoreResRegexs);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };

    const url = `${this.baseUrl.replace(/\/+$/, "")}/${this.apiPath.replace(/^\/+/, "")}`;
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
          ...this.headers,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: renderSystemPrompt(this.prompt, request),
          messages: [{ role: "user", content: buildYamlBatch(request.texts) }],
          ...(this.temperature !== undefined
            ? { temperature: this.temperature }
            : {}),
        }),
      },
      signal,
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw await responseError(response, this.id);

    const data = (await parseJsonResponse(response, this.id)) as ClaudeResponse;
    const content = data.content
      ?.filter(
        (block) => block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text as string)
      .join("\n");
    if (!content) {
      throw new TranslateError(
        "parse",
        "Claude response is missing text content.",
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
              inputTokens: data.usage.input_tokens,
              outputTokens: data.usage.output_tokens,
            },
          }
        : {}),
    };
  }
}
