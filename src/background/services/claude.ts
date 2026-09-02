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
  buildRefusalPatterns,
  buildYamlBatch,
  matchesRefusal,
  parseYamlBatch,
} from "./openai-compatible";
import {
  DEFAULT_PROMPTS,
  renderPromptTemplate,
  requestPromptVariant,
} from "./prompts";
import { readSse } from "./stream";

export interface ClaudeServiceOptions {
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
  ignoreResRegexs?: string[];
  timeoutMs?: number;
  stream?: boolean;
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
  private readonly promptSystem?: string;
  private readonly promptUser?: string;
  private readonly temperature?: number;
  private readonly maxTokens: number;
  private readonly headers: Record<string, string>;
  private readonly refusalPatterns: RegExp[];
  private readonly timeoutMs: number;
  private readonly stream: boolean;

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
    this.promptSystem = options.promptSystem ?? options.prompt;
    this.promptUser = options.promptUser;
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens ?? 4096;
    this.headers = options.headers ?? {};
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

    const url = `${this.baseUrl.replace(/\/+$/, "")}/${this.apiPath.replace(/^\/+/, "")}`;
    const batch = buildYamlBatch(request.texts);
    const templates = DEFAULT_PROMPTS[requestPromptVariant(request)];
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
          system: renderPromptTemplate(
            this.promptSystem ?? templates.system,
            request,
            batch,
          ),
          messages: [
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
        }),
      },
      signal,
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw await responseError(response, this.id);

    let data: ClaudeResponse = {};
    let content: string | undefined;
    if (this.stream) {
      content = await readSse(
        response,
        this.id,
        (event) => {
          try {
            const chunk = JSON.parse(event) as {
              type?: string;
              delta?: { type?: string; text?: unknown };
            };
            return chunk.type === "content_block_delta" &&
              chunk.delta?.type === "text_delta" &&
              typeof chunk.delta.text === "string"
              ? chunk.delta.text
              : undefined;
          } catch (error) {
            throw new TranslateError(
              "parse",
              "Claude stream returned invalid JSON.",
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
      data = (await parseJsonResponse(response, this.id)) as ClaudeResponse;
      content = data.content
        ?.filter(
          (block) => block.type === "text" && typeof block.text === "string",
        )
        .map((block) => block.text as string)
        .join("\n");
    }
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
