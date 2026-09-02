import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
import { assertPair, fetchJson, randomId, supportsPair } from "./mt-utils";

export interface AzureTranslatorServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  region?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface AzureResponseItem {
  translations?: Array<{ text?: unknown }>;
}

/** Microsoft Azure Translator v3 adapter. */
export class AzureTranslatorService extends BaseService {
  private readonly apiKey?: string;
  private readonly region?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: AzureTranslatorServiceOptions = {}) {
    super({
      id: options.id ?? "azure-translator",
      name: options.name ?? "Azure Translator",
      maxBatchSize: options.maxBatchSize ?? 100,
      maxBatchChars: options.maxBatchChars ?? 50_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 10,
        concurrency: options.rateLimit?.concurrency ?? 4,
      },
      placeholder: { open: "@", close: "#" },
    });
    this.apiKey = options.apiKey;
    this.region = options.region;
    this.baseUrl =
      options.baseUrl ?? "https://api.cognitive.microsofttranslator.com";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.azure);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { from, to } = assertPair(request, LANGUAGE_MAPS.azure, this.id);
    const params = new URLSearchParams({
      "api-version": "3.0",
      to,
      textType: "html",
    });
    if (from !== "auto") params.set("from", from);
    const data = (await fetchJson(
      `${this.baseUrl.replace(/\/+$/, "")}/translate?${params}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "Ocp-Apim-Subscription-Key": this.apiKey } : {}),
          ...(this.region
            ? { "Ocp-Apim-Subscription-Region": this.region }
            : {}),
          "X-ClientTraceId": randomId(),
        },
        body: JSON.stringify(request.texts.map((Text) => ({ Text }))),
      },
      signal,
      this.timeoutMs,
      this.id,
    )) as AzureResponseItem[];
    if (!Array.isArray(data) || data.length !== request.texts.length) {
      throw new TranslateError(
        "parse",
        "Azure Translator response item count does not match.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    return {
      texts: data.map((item) => {
        const text = item.translations?.[0]?.text;
        if (typeof text !== "string") {
          throw new TranslateError(
            "parse",
            "Azure Translator response is missing text.",
            {
              serviceId: this.id,
              retryable: false,
            },
          );
        }
        return text;
      }),
    };
  }
}
