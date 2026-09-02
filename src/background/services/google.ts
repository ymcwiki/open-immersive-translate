import type { RateLimit, TranslateRequest } from "../../shared/types";
import { normalizeLang } from "../../shared/lang";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
  fetchWithTimeout,
  mapWithConcurrency,
  parseJsonResponse,
  responseError,
} from "./base";

export interface GoogleServiceOptions {
  id?: string;
  name?: string;
  endpoint?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface GoogleItemResult {
  text: string;
  detectedLanguage?: string;
}

/** Google free translation endpoint adapter. */
export class GoogleService extends BaseService {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: GoogleServiceOptions = {}) {
    super({
      id: options.id ?? "google",
      name: options.name ?? "Google",
      maxBatchSize: options.maxBatchSize ?? 1,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 4,
      },
      placeholder: { open: "<b>", close: "</b>" },
    });
    this.endpoint =
      options.endpoint ?? "https://translate.googleapis.com/translate_a/single";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    const results = await mapWithConcurrency(
      request.texts,
      4,
      async (text): Promise<GoogleItemResult> => {
        const url = new URL(this.endpoint);
        url.searchParams.set("client", "gtx");
        url.searchParams.set("sl", request.from);
        url.searchParams.set("tl", request.to);
        url.searchParams.set("dt", "t");
        url.searchParams.set("q", text);

        const response = await fetchWithTimeout(
          url.toString(),
          { method: "GET" },
          signal,
          this.timeoutMs,
          this.id,
        );
        if (!response.ok) throw await responseError(response, this.id);
        const data = await parseJsonResponse(response, this.id);
        if (!Array.isArray(data) || !Array.isArray(data[0])) {
          throw new TranslateError(
            "parse",
            "Google response has an invalid shape.",
            {
              serviceId: this.id,
              retryable: false,
            },
          );
        }
        const translated = data[0]
          .map((segment: unknown) =>
            Array.isArray(segment) && typeof segment[0] === "string"
              ? segment[0]
              : "",
          )
          .join("");
        if (!translated && text) {
          throw new TranslateError(
            "parse",
            "Google response has no translation.",
            {
              serviceId: this.id,
              retryable: false,
            },
          );
        }
        return {
          text: translated,
          detectedLanguage: typeof data[2] === "string" ? data[2] : undefined,
        };
      },
    );

    const detectedLanguage = results.find(
      (result) => result.detectedLanguage,
    )?.detectedLanguage;
    return {
      texts: results.map((result) => result.text),
      ...(detectedLanguage
        ? { detectedLanguage: normalizeLang(detectedLanguage) }
        : {}),
    };
  }
}
