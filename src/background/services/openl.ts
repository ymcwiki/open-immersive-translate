import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import { BaseService, type ServiceTranslateResult } from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
import {
  assertPair,
  fetchJson,
  supportsPair,
  translateOneByOne,
  translatedString,
} from "./mt-utils";

export interface OpenLServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface OpenLResponse {
  translatedText?: unknown;
  translation?: unknown;
}

export class OpenLService extends BaseService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OpenLServiceOptions = {}) {
    super({
      id: options.id ?? "openl",
      name: options.name ?? "OpenL",
      maxBatchSize: options.maxBatchSize ?? 10,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 3,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "@", close: "#" },
    });
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openl.club/translate";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.openl);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { from, to } = assertPair(request, LANGUAGE_MAPS.openl, this.id);
    return translateOneByOne(
      request,
      this.rateLimit.concurrency,
      async (text) => {
        const data = (await fetchJson(
          this.baseUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(this.apiKey
                ? { Authorization: `Bearer ${this.apiKey}` }
                : {}),
            },
            body: JSON.stringify({ source_lang: from, target_lang: to, text }),
          },
          signal,
          this.timeoutMs,
          this.id,
        )) as OpenLResponse;
        return translatedString(
          data.translatedText ?? data.translation,
          this.id,
        );
      },
    );
  }
}
