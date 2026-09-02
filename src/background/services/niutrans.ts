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

export interface NiuTransServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface NiuTransResponse {
  tgt_text?: unknown;
}

export class NiuTransService extends BaseService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: NiuTransServiceOptions = {}) {
    super({
      id: options.id ?? "niutrans",
      name: options.name ?? "NiuTrans",
      maxBatchSize: options.maxBatchSize ?? 10,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "@", close: "#" },
    });
    this.apiKey = options.apiKey;
    this.baseUrl =
      options.baseUrl ?? "https://api.niutrans.com/NiuTransServer/translation";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.niutrans);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { from, to } = assertPair(request, LANGUAGE_MAPS.niutrans, this.id);
    return translateOneByOne(
      request,
      this.rateLimit.concurrency,
      async (text) => {
        const form = new URLSearchParams({
          from,
          to,
          src_text: text,
          ...(this.apiKey ? { apikey: this.apiKey } : {}),
        });
        const data = (await fetchJson(
          this.baseUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
          },
          signal,
          this.timeoutMs,
          this.id,
        )) as NiuTransResponse;
        return translatedString(data.tgt_text, this.id);
      },
    );
  }
}
