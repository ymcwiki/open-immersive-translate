import type { RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
  fetchWithTimeout,
  mapWithConcurrency,
  parseJsonResponse,
  responseError,
} from "./base";

export interface CustomHttpServiceOptions {
  id?: string;
  name?: string;
  url?: string;
  baseUrl?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  requestBodyTemplate?: string;
  responseJsonPath?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

export function renderBodyTemplate(
  template: string,
  values: { text: string; from: string; to: string },
): string {
  return template.replace(
    /(["']){{(text|from|to)}}\1|{{(text|from|to)}}/g,
    (
      _match,
      _quote: string | undefined,
      quotedKey: string | undefined,
      bareKey: string | undefined,
    ) => JSON.stringify(values[(quotedKey ?? bareKey) as keyof typeof values]),
  );
}

export function readJsonPath(value: unknown, path: string): unknown {
  const normalized = path.replace(/\[(\d+)]/g, ".$1").replace(/^\./, "");
  if (!normalized) return value;

  return normalized.split(".").reduce<unknown>((current, key) => {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      return undefined;
    }
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      return current[Number(key)];
    }
    if (typeof current === "object" && current !== null) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

/** User-templated HTTP translation adapter. */
export class CustomHttpService extends BaseService {
  private readonly url?: string;
  private readonly method: string;
  private readonly headers: Record<string, string>;
  private readonly bodyTemplate: string;
  private readonly responseJsonPath?: string;
  private readonly timeoutMs: number;

  constructor(options: CustomHttpServiceOptions = {}) {
    super({
      id: options.id ?? "custom-http",
      name: options.name ?? "Custom HTTP",
      maxBatchSize: options.maxBatchSize ?? 1,
      maxBatchChars: options.maxBatchChars ?? 8_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 2,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.url = options.url ?? options.baseUrl;
    this.method = (options.method ?? "POST").toUpperCase();
    this.headers = options.headers ?? {};
    this.bodyTemplate =
      options.bodyTemplate ??
      options.requestBodyTemplate ??
      '{"text":"{{text}}","from":"{{from}}","to":"{{to}}"}';
    this.responseJsonPath = options.responseJsonPath;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!this.url || !this.responseJsonPath) {
      throw new TranslateError(
        "invalid_config",
        "Custom HTTP url and responseJsonPath are required.",
        { serviceId: this.id, retryable: false },
      );
    }

    const results = await mapWithConcurrency(
      request.texts,
      this.rateLimit.concurrency,
      async (text) => {
        const renderedUrl = this.url
          ?.replace(/{{text}}/g, () => encodeURIComponent(text))
          .replace(/{{from}}/g, () => encodeURIComponent(request.from))
          .replace(/{{to}}/g, () => encodeURIComponent(request.to));
        const sendsBody = this.method !== "GET" && this.method !== "HEAD";
        const body = sendsBody
          ? renderBodyTemplate(this.bodyTemplate, {
              text,
              from: request.from,
              to: request.to,
            })
          : undefined;
        if (body !== undefined) {
          try {
            JSON.parse(body);
          } catch (error) {
            throw new TranslateError(
              "invalid_config",
              "Custom HTTP body template did not produce valid JSON.",
              { serviceId: this.id, retryable: false, cause: error },
            );
          }
        }

        const response = await fetchWithTimeout(
          renderedUrl as string,
          {
            method: this.method,
            headers: { "Content-Type": "application/json", ...this.headers },
            ...(body === undefined ? {} : { body }),
          },
          signal,
          this.timeoutMs,
          this.id,
        );
        if (!response.ok) throw await responseError(response, this.id);
        const data = await parseJsonResponse(response, this.id);
        const translated = readJsonPath(data, this.responseJsonPath as string);
        if (typeof translated !== "string") {
          throw new TranslateError(
            "parse",
            `Custom HTTP response path ${this.responseJsonPath} is not a string.`,
            { serviceId: this.id, retryable: false },
          );
        }
        return translated;
      },
    );

    return { texts: results };
  }
}
