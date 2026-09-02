import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import {
  DEEPL_SOURCE_LANGUAGE_MAP,
  LANGUAGE_MAPS,
  providerLanguage,
} from "./language-pairs";
import { assertPair, fetchJson, supportsPair } from "./mt-utils";

export type DeepLFormality =
  "default" | "more" | "less" | "prefer_more" | "prefer_less";

export interface DeepLServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  pro?: boolean;
  formality?: DeepLFormality;
  tagHandling?: "html" | "xml" | "none";
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface DeepLResponse {
  translations?: Array<{ text?: unknown; detected_source_language?: unknown }>;
}

/** Official DeepL Free/Pro text translation API. */
export class DeepLService extends BaseService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly formality?: DeepLFormality;
  private readonly tagHandling: "html" | "xml" | "none";
  private readonly timeoutMs: number;

  constructor(options: DeepLServiceOptions = {}) {
    super({
      id: options.id ?? "deepl",
      name: options.name ?? "DeepL",
      maxBatchSize: options.maxBatchSize ?? 50,
      maxBatchChars: options.maxBatchChars ?? 100_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 10,
        concurrency: options.rateLimit?.concurrency ?? 4,
      },
      placeholder: { open: "{{", close: "}}" },
    });
    this.apiKey = options.apiKey;
    this.baseUrl =
      options.baseUrl ??
      (options.pro
        ? "https://api.deepl.com/v2"
        : "https://api-free.deepl.com/v2");
    this.formality = options.formality;
    this.tagHandling = options.tagHandling ?? "html";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.deepl);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { to } = assertPair(request, LANGUAGE_MAPS.deepl, this.id);
    const from = providerLanguage(request.from, DEEPL_SOURCE_LANGUAGE_MAP);
    if (from === undefined) {
      throw new TranslateError(
        "invalid_config",
        `DeepL does not support source language ${request.from}.`,
        { serviceId: this.id, retryable: false },
      );
    }
    const data = (await fetchJson(
      `${this.baseUrl.replace(/\/+$/, "")}/translate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey
            ? { Authorization: `DeepL-Auth-Key ${this.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          text: request.texts,
          target_lang: to,
          ...(from ? { source_lang: from } : {}),
          ...(this.tagHandling !== "none"
            ? { tag_handling: this.tagHandling }
            : {}),
          ...(this.formality && this.formality !== "default"
            ? { formality: this.formality }
            : {}),
        }),
      },
      signal,
      this.timeoutMs,
      this.id,
    )) as DeepLResponse;
    const translations = data.translations;
    if (!translations || translations.length !== request.texts.length) {
      throw new TranslateError(
        "parse",
        "DeepL response item count does not match the request.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const texts = translations.map((item) => {
      if (typeof item.text !== "string") {
        throw new TranslateError(
          "parse",
          "DeepL response is missing translated text.",
          {
            serviceId: this.id,
            retryable: false,
          },
        );
      }
      return item.text;
    });
    return { texts };
  }
}
