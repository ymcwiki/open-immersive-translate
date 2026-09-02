import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { sha256Hex } from "./crypto";
import { LANGUAGE_MAPS } from "./language-pairs";
import {
  assertPair,
  fetchJson,
  supportsPair,
  translateOneByOne,
  translatedString,
} from "./mt-utils";

export interface YoudaoServiceOptions {
  id?: string;
  name?: string;
  appId?: string;
  secret?: string;
  baseUrl?: string;
  salt?: () => string;
  now?: () => Date;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface YoudaoResponse {
  translation?: unknown[];
  errorCode?: string;
}

function signInput(text: string): string {
  return text.length <= 20
    ? text
    : `${text.slice(0, 10)}${text.length}${text.slice(-10)}`;
}

export class YoudaoService extends BaseService {
  private readonly appId?: string;
  private readonly secret?: string;
  private readonly baseUrl: string;
  private readonly salt: () => string;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(options: YoudaoServiceOptions = {}) {
    super({
      id: options.id ?? "youdao",
      name: options.name ?? "Youdao Translate",
      maxBatchSize: options.maxBatchSize ?? 10,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "🚠", close: "🚠" },
    });
    this.appId = options.appId;
    this.secret = options.secret;
    this.baseUrl = options.baseUrl ?? "https://openapi.youdao.com/api";
    this.salt =
      options.salt ??
      (() => Math.floor(Math.random() * 1_000_000_000).toString());
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.youdao);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    if (!this.appId || !this.secret) {
      throw new TranslateError(
        "invalid_config",
        "Youdao requires appKey and secret.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const { from, to } = assertPair(request, LANGUAGE_MAPS.youdao, this.id);
    return translateOneByOne(
      request,
      this.rateLimit.concurrency,
      async (text) => {
        const salt = this.salt();
        const curtime = Math.floor(this.now().getTime() / 1_000).toString();
        const sign = await sha256Hex(
          `${this.appId}${signInput(text)}${salt}${curtime}${this.secret}`,
        );
        const form = new URLSearchParams({
          q: text,
          from,
          to,
          appKey: this.appId as string,
          salt,
          sign,
          signType: "v3",
          curtime,
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
        )) as YoudaoResponse;
        if (data.errorCode && data.errorCode !== "0") {
          throw new TranslateError("parse", `Youdao error ${data.errorCode}.`, {
            serviceId: this.id,
            retryable: false,
          });
        }
        return translatedString(data.translation?.[0], this.id);
      },
    );
  }
}
