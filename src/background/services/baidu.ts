import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { md5 } from "./crypto";
import { LANGUAGE_MAPS } from "./language-pairs";
import {
  assertPair,
  fetchJson,
  supportsPair,
  translateOneByOne,
  translatedString,
} from "./mt-utils";

export interface BaiduServiceOptions {
  id?: string;
  name?: string;
  appId?: string;
  secret?: string;
  baseUrl?: string;
  salt?: () => string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface BaiduResponse {
  trans_result?: Array<{ dst?: unknown }>;
  error_msg?: string;
}

export class BaiduService extends BaseService {
  private readonly appId?: string;
  private readonly secret?: string;
  private readonly baseUrl: string;
  private readonly salt: () => string;
  private readonly timeoutMs: number;

  constructor(options: BaiduServiceOptions = {}) {
    super({
      id: options.id ?? "baidu",
      name: options.name ?? "Baidu Translate",
      maxBatchSize: options.maxBatchSize ?? 10,
      maxBatchChars: options.maxBatchChars ?? 2_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 1,
        concurrency: options.rateLimit?.concurrency ?? 1,
      },
      placeholder: { open: "#", close: "#" },
    });
    this.appId = options.appId;
    this.secret = options.secret;
    this.baseUrl =
      options.baseUrl ?? "https://fanyi-api.baidu.com/api/trans/vip/translate";
    this.salt =
      options.salt ??
      (() => Math.floor(Math.random() * 1_000_000_000).toString());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.baidu);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    if (!this.appId || !this.secret) {
      throw new TranslateError(
        "invalid_config",
        "Baidu requires appId and secret.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const { from, to } = assertPair(request, LANGUAGE_MAPS.baidu, this.id);
    return translateOneByOne(
      request,
      this.rateLimit.concurrency,
      async (text) => {
        const salt = this.salt();
        const form = new URLSearchParams({
          q: text,
          from,
          to,
          appid: this.appId as string,
          salt,
          sign: md5(`${this.appId}${text}${salt}${this.secret}`),
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
        )) as BaiduResponse;
        if (data.error_msg) {
          throw new TranslateError("parse", data.error_msg, {
            serviceId: this.id,
            retryable: false,
          });
        }
        return translatedString(data.trans_result?.[0]?.dst, this.id);
      },
    );
  }
}
