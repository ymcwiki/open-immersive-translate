import type {
  GlossaryEntry,
  RateLimit,
  TranslateRequest,
} from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
  fetchWithTimeout,
  parseJsonResponse,
  responseError,
} from "./base";

export const DEFAULT_SYSTEM_PROMPT = `You are a professional translation engine. Translate the input from {{from}} to {{to}}.
Return only a YAML list with exactly the same ids and item count as the input. Preserve HTML tags and their positions. Do not translate proper nouns or code.
Page title: {{title}}
Glossary:
{{glossary}}`;

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
  temperature?: number;
  maxTokens?: number;
  headers?: Record<string, string>;
  extraHeaders?: Record<string, string>;
  ignoreResRegexs?: string[];
  timeoutMs?: number;
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

function glossaryText(glossary: readonly GlossaryEntry[] | undefined): string {
  if (!glossary?.length) return "(none)";
  return glossary.map(({ k, v }) => `${k}: ${v}`).join("\n");
}

/** Fill the four supported system-prompt variables. */
export function renderSystemPrompt(
  template: string,
  request: TranslateRequest,
): string {
  const variables: Record<string, string> = {
    from: request.from,
    to: request.to,
    title: request.context?.title ?? "",
    glossary: glossaryText(request.glossary),
  };
  let prompt = template.replace(
    /{{(from|to|title|glossary)}}/g,
    (_, key: keyof typeof variables) => variables[key],
  );
  if (request.context?.summary) {
    prompt += `\nPage summary: ${request.context.summary}`;
  }
  return prompt;
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
  private readonly prompt: string;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly headers: Record<string, string>;
  private readonly refusalPatterns: RegExp[];
  private readonly timeoutMs: number;

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
    this.prompt = options.prompt ?? DEFAULT_SYSTEM_PROMPT;
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens;
    this.headers = { ...options.headers, ...options.extraHeaders };
    this.refusalPatterns = buildRefusalPatterns(options.ignoreResRegexs);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...this.headers,
    };
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: renderSystemPrompt(this.prompt, request) },
        { role: "user", content: buildYamlBatch(request.texts) },
      ],
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

    const data = (await parseJsonResponse(response, this.id)) as OpenAIResponse;
    const content = data.choices?.[0]?.message?.content;
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
