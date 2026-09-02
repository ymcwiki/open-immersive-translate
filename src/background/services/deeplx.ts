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

export interface DeepLXServiceOptions {
  id?: string;
  name?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

/** DeepLX-compatible endpoint adapter. */
export class DeepLXService extends BaseService {
  private readonly baseUrl?: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: DeepLXServiceOptions = {}) {
    super({
      id: options.id ?? "deeplx",
      name: options.name ?? "DeepLX",
      maxBatchSize: options.maxBatchSize ?? 1,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 3,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "<b>", close: "</b>" },
    });
    this.baseUrl = options.baseUrl;
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!this.baseUrl) {
      throw new TranslateError(
        "invalid_config",
        "DeepLX baseUrl is required.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const url = `${this.baseUrl.replace(/\/+$/, "")}/translate`;
    const results = await mapWithConcurrency(
      request.texts,
      this.rateLimit.concurrency,
      async (text) => {
        const response = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...this.headers },
            body: JSON.stringify({
              text,
              source_lang: request.from,
              target_lang: request.to,
            }),
          },
          signal,
          this.timeoutMs,
          this.id,
        );
        if (!response.ok) throw await responseError(response, this.id);
        const data = (await parseJsonResponse(response, this.id)) as {
          data?: unknown;
          translation?: unknown;
        };
        const translated =
          typeof data.data === "string"
            ? data.data
            : typeof data.translation === "string"
              ? data.translation
              : undefined;
        if (translated === undefined) {
          throw new TranslateError(
            "parse",
            "DeepLX response has no translation.",
            {
              serviceId: this.id,
              retryable: false,
            },
          );
        }
        return translated;
      },
    );

    return { texts: results };
  }
}
