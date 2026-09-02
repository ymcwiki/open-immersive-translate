import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  type TranslationStreamOptions,
  TranslateError,
  fetchWithTimeout,
  parseJsonResponse,
  responseError,
} from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
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
import { supportsPair } from "./mt-utils";

export interface GeminiServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  prompt?: string;
  promptSystem?: string;
  promptUser?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  ignoreResRegexs?: string[];
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

function responseText(data: GeminiResponse): string | undefined {
  const content = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === "string")
    .join("");
  return content || undefined;
}

/** Gemini generateContent adapter with optional SSE streaming. */
export class GeminiService extends BaseService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly promptSystem?: string;
  private readonly promptUser?: string;
  private readonly temperature?: number;
  private readonly maxTokens: number;
  private readonly stream: boolean;
  private readonly refusalPatterns: RegExp[];
  private readonly timeoutMs: number;

  constructor(options: GeminiServiceOptions = {}) {
    super({
      id: options.id ?? "gemini",
      name: options.name ?? "Gemini",
      maxBatchSize: options.maxBatchSize ?? 4,
      maxBatchChars: options.maxBatchChars ?? 3_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 0.2,
        concurrency: options.rateLimit?.concurrency ?? 1,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.apiKey = options.apiKey;
    this.baseUrl =
      options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    this.model = options.model ?? "gemini-2.5-flash";
    this.promptSystem = options.promptSystem ?? options.prompt;
    this.promptUser = options.promptUser;
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens ?? 2_048;
    this.stream = options.stream ?? false;
    this.refusalPatterns = buildRefusalPatterns(options.ignoreResRegexs);
    this.timeoutMs = options.timeoutMs ?? 101_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.ai);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
    options?: TranslationStreamOptions,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const batch = buildYamlBatch(request.texts);
    const templates = DEFAULT_PROMPTS[requestPromptVariant(request)];
    const method = this.stream ? "streamGenerateContent" : "generateContent";
    const params = new URLSearchParams();
    if (this.stream) params.set("alt", "sse");
    if (this.apiKey) params.set("key", this.apiKey);
    const query = params.size ? `?${params}` : "";
    const url = `${this.baseUrl.replace(/\/+$/, "")}/models/${encodeURIComponent(this.model)}:${method}${query}`;
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: renderPromptTemplate(
                  this.promptSystem ?? templates.system,
                  request,
                  batch,
                ),
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: renderPromptTemplate(
                    this.promptUser ?? templates.user,
                    request,
                    batch,
                  ),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: this.temperature ?? 0,
            maxOutputTokens: this.maxTokens,
          },
        }),
      },
      signal,
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw await responseError(response, this.id);

    let data: GeminiResponse = {};
    const content = this.stream
      ? await readSse(
          response,
          this.id,
          (event) => {
            try {
              return responseText(JSON.parse(event) as GeminiResponse);
            } catch (error) {
              throw new TranslateError(
                "parse",
                "Gemini stream returned invalid JSON.",
                {
                  serviceId: this.id,
                  retryable: false,
                  cause: error,
                },
              );
            }
          },
          options,
        )
      : responseText(
          (data = (await parseJsonResponse(
            response,
            this.id,
          )) as GeminiResponse),
        );
    if (!content) {
      throw new TranslateError(
        "parse",
        "Gemini response is missing text content.",
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
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }

    const byId = parseYamlBatch(content);
    const texts: string[] = [];
    const errors: Array<TranslateError | undefined> = [];
    for (let index = 0; index < request.texts.length; index += 1) {
      const text = byId.get(index + 1);
      texts.push(text ?? "");
      errors.push(
        text === undefined
          ? new TranslateError(
              "parse",
              `Translation response is missing id ${index + 1}.`,
              {
                serviceId: this.id,
                retryable: false,
              },
            )
          : undefined,
      );
    }
    return {
      texts,
      ...(errors.some(Boolean) ? { errors } : {}),
      ...(data.usageMetadata
        ? {
            usage: {
              inputTokens: data.usageMetadata.promptTokenCount,
              outputTokens: data.usageMetadata.candidatesTokenCount,
            },
          }
        : {}),
    };
  }
}
