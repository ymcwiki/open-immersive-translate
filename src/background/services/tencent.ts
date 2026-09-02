import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { hmac, hmacHex, sha256Hex } from "./crypto";
import { LANGUAGE_MAPS } from "./language-pairs";
import {
  assertPair,
  fetchJson,
  supportsPair,
  translateOneByOne,
  translatedString,
} from "./mt-utils";

export interface TencentServiceOptions {
  id?: string;
  name?: string;
  appId?: string;
  secret?: string;
  region?: string;
  baseUrl?: string;
  now?: () => Date;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface TencentResponse {
  Response?: { TargetText?: unknown; Error?: { Message?: string } };
}

export class TencentService extends BaseService {
  private readonly appId?: string;
  private readonly secret?: string;
  private readonly region: string;
  private readonly baseUrl: string;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(options: TencentServiceOptions = {}) {
    super({
      id: options.id ?? "tencent",
      name: options.name ?? "Tencent TMT",
      maxBatchSize: options.maxBatchSize ?? 10,
      maxBatchChars: options.maxBatchChars ?? 2_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 3,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.appId = options.appId;
    this.secret = options.secret;
    this.region = options.region ?? "ap-beijing";
    this.baseUrl = options.baseUrl ?? "https://tmt.tencentcloudapi.com";
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.tencent);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    if (!this.appId || !this.secret) {
      throw new TranslateError(
        "invalid_config",
        "Tencent TMT requires SecretId and SecretKey.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const { from, to } = assertPair(request, LANGUAGE_MAPS.tencent, this.id);
    return translateOneByOne(
      request,
      this.rateLimit.concurrency,
      async (text) => {
        const body = JSON.stringify({
          SourceText: text,
          Source: from,
          Target: to,
          ProjectId: 0,
        });
        const timestamp = Math.floor(this.now().getTime() / 1_000).toString();
        const date = new Date(Number(timestamp) * 1_000)
          .toISOString()
          .slice(0, 10);
        const host = new URL(this.baseUrl).host;
        const contentType = "application/json; charset=utf-8";
        const action = "TextTranslate";
        const signedHeaders = "content-type;host;x-tc-action";
        const canonicalHeaders =
          `content-type:${contentType}\n` +
          `host:${host}\n` +
          `x-tc-action:texttranslate\n`;
        const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${await sha256Hex(body)}`;
        const scope = `${date}/tmt/tc3_request`;
        const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${await sha256Hex(canonicalRequest)}`;
        const dateKey = await hmac("SHA-256", `TC3${this.secret}`, date);
        const serviceKey = await hmac("SHA-256", dateKey, "tmt");
        const signingKey = await hmac("SHA-256", serviceKey, "tc3_request");
        const signature = await hmacHex("SHA-256", signingKey, stringToSign);
        const authorization =
          `TC3-HMAC-SHA256 Credential=${this.appId}/${scope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`;
        const data = (await fetchJson(
          this.baseUrl,
          {
            method: "POST",
            headers: {
              Authorization: authorization,
              "Content-Type": contentType,
              "X-TC-Action": action,
              "X-TC-Timestamp": timestamp,
              "X-TC-Version": "2018-03-21",
              "X-TC-Region": this.region,
            },
            body,
          },
          signal,
          this.timeoutMs,
          this.id,
        )) as TencentResponse;
        if (data.Response?.Error) {
          throw new TranslateError(
            "parse",
            data.Response.Error.Message ?? "Tencent TMT error.",
            {
              serviceId: this.id,
              retryable: false,
            },
          );
        }
        return translatedString(data.Response?.TargetText, this.id);
      },
    );
  }
}
