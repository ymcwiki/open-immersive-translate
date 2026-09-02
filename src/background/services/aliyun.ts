import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { base64, hmac, percentEncode } from "./crypto";
import { LANGUAGE_MAPS } from "./language-pairs";
import {
  assertPair,
  fetchJson,
  randomId,
  supportsPair,
  translateOneByOne,
  translatedString,
} from "./mt-utils";

export interface AliyunServiceOptions {
  id?: string;
  name?: string;
  appId?: string;
  secret?: string;
  region?: string;
  baseUrl?: string;
  now?: () => Date;
  nonce?: () => string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface AliyunResponse {
  Data?: { Translated?: unknown };
  Message?: string;
}

function canonicalQuery(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
}

export class AliyunService extends BaseService {
  private readonly appId?: string;
  private readonly secret?: string;
  private readonly region: string;
  private readonly baseUrl: string;
  private readonly now: () => Date;
  private readonly nonce: () => string;
  private readonly timeoutMs: number;

  constructor(options: AliyunServiceOptions = {}) {
    super({
      id: options.id ?? "aliyun",
      name: options.name ?? "Alibaba Cloud Translate",
      maxBatchSize: options.maxBatchSize ?? 10,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{{", close: "}}" },
    });
    this.appId = options.appId;
    this.secret = options.secret;
    this.region = options.region ?? "cn-hangzhou";
    this.baseUrl = options.baseUrl ?? "https://mt.cn-hangzhou.aliyuncs.com/";
    this.now = options.now ?? (() => new Date());
    this.nonce = options.nonce ?? randomId;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.aliyun);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    if (!this.appId || !this.secret) {
      throw new TranslateError(
        "invalid_config",
        "Alibaba Cloud requires AccessKey ID and secret.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const { from, to } = assertPair(request, LANGUAGE_MAPS.aliyun, this.id);
    return translateOneByOne(
      request,
      this.rateLimit.concurrency,
      async (text) => {
        const parameters: Record<string, string> = {
          AccessKeyId: this.appId as string,
          Action: "TranslateGeneral",
          Format: "JSON",
          FormatType: "text",
          RegionId: this.region,
          Scene: "general",
          SignatureMethod: "HMAC-SHA1",
          SignatureNonce: this.nonce(),
          SignatureVersion: "1.0",
          SourceLanguage: from,
          SourceText: text,
          TargetLanguage: to,
          Timestamp: this.now()
            .toISOString()
            .replace(/\.\d{3}Z$/, "Z"),
          Version: "2018-10-12",
        };
        const stringToSign = `POST&%2F&${percentEncode(canonicalQuery(parameters))}`;
        parameters.Signature = base64(
          await hmac("SHA-1", `${this.secret}&`, stringToSign),
        );
        const form = new URLSearchParams(parameters);
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
        )) as AliyunResponse;
        if (data.Message && data.Data?.Translated === undefined) {
          throw new TranslateError("parse", data.Message, {
            serviceId: this.id,
            retryable: false,
          });
        }
        return translatedString(data.Data?.Translated, this.id);
      },
    );
  }
}
