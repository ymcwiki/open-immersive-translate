import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
import { assertPair, fetchJson, randomId, supportsPair } from "./mt-utils";

export interface CaiyunServiceOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface CaiyunResponse {
  target?: unknown;
  message?: string;
}

export class CaiyunService extends BaseService {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: CaiyunServiceOptions = {}) {
    super({
      id: options.id ?? "caiyun",
      name: options.name ?? "Caiyun Translate",
      maxBatchSize: options.maxBatchSize ?? 20,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.apiKey = options.apiKey;
    this.baseUrl =
      options.baseUrl ?? "https://api.interpreter.caiyunai.com/v1/translator";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    if (!["auto", "en", "zh-CN", "zh-TW", "ja"].includes(from)) return false;
    if (!["en", "zh-CN", "zh-TW", "ja"].includes(to)) return false;
    return supportsPair(from, to, LANGUAGE_MAPS.caiyun);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { from, to } = assertPair(request, LANGUAGE_MAPS.caiyun, this.id);
    const data = (await fetchJson(
      this.baseUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "x-authorization": `token ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          source: request.texts,
          trans_type: `${from}2${to}`,
          request_id: randomId(),
          detect: request.from === "auto",
        }),
      },
      signal,
      this.timeoutMs,
      this.id,
    )) as CaiyunResponse;
    const target =
      typeof data.target === "string" ? [data.target] : data.target;
    if (
      !Array.isArray(target) ||
      target.length !== request.texts.length ||
      target.some((text) => typeof text !== "string")
    ) {
      throw new TranslateError(
        "parse",
        data.message ?? "Caiyun response item count does not match.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    return { texts: target as string[] };
  }
}
