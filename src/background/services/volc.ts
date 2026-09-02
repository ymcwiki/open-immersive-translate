import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { hmac, hmacHex, sha256Hex } from "./crypto";
import { LANGUAGE_MAPS } from "./language-pairs";
import { assertPair, fetchJson, supportsPair } from "./mt-utils";

export interface VolcServiceOptions {
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

interface VolcResponse {
  Result?: { TranslationList?: Array<{ Translation?: unknown }> };
  ResponseMetadata?: { Error?: { Message?: string } };
}

export class VolcService extends BaseService {
  private readonly appId?: string;
  private readonly secret?: string;
  private readonly region: string;
  private readonly baseUrl: string;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(options: VolcServiceOptions = {}) {
    super({
      id: options.id ?? "volc",
      name: options.name ?? "Volcengine Translate",
      maxBatchSize: options.maxBatchSize ?? 16,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.appId = options.appId;
    this.secret = options.secret;
    this.region = options.region ?? "cn-north-1";
    this.baseUrl = options.baseUrl ?? "https://open.volcengineapi.com";
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.volc);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    if (!this.appId || !this.secret) {
      throw new TranslateError(
        "invalid_config",
        "Volcengine requires AccessKey ID and secret.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const { from, to } = assertPair(request, LANGUAGE_MAPS.volc, this.id);
    const host = new URL(this.baseUrl).host;
    const query = "Action=TranslateText&Version=2020-06-01";
    const body = JSON.stringify({
      SourceLanguage: from,
      TargetLanguage: to,
      TextList: request.texts,
    });
    const now = this.now();
    const xDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const shortDate = xDate.slice(0, 8);
    const contentType = "application/json; charset=utf-8";
    const bodyHash = await sha256Hex(body);
    const signedHeaders = "content-type;host;x-content-sha256;x-date";
    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-content-sha256:${bodyHash}\n` +
      `x-date:${xDate}\n`;
    const canonicalRequest = `POST\n/\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${bodyHash}`;
    const scope = `${shortDate}/${this.region}/translate/request`;
    const stringToSign = `HMAC-SHA256\n${xDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;
    const dateKey = await hmac("SHA-256", this.secret, shortDate);
    const regionKey = await hmac("SHA-256", dateKey, this.region);
    const serviceKey = await hmac("SHA-256", regionKey, "translate");
    const signingKey = await hmac("SHA-256", serviceKey, "request");
    const signature = await hmacHex("SHA-256", signingKey, stringToSign);
    const authorization =
      `HMAC-SHA256 Credential=${this.appId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const data = (await fetchJson(
      `${this.baseUrl.replace(/\/+$/, "")}/?${query}`,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": contentType,
          "X-Date": xDate,
          "X-Content-Sha256": bodyHash,
        },
        body,
      },
      signal,
      this.timeoutMs,
      this.id,
    )) as VolcResponse;
    const translations = data.Result?.TranslationList;
    if (!translations || translations.length !== request.texts.length) {
      throw new TranslateError(
        "parse",
        data.ResponseMetadata?.Error?.Message ??
          "Volcengine response item count does not match.",
        { serviceId: this.id, retryable: false },
      );
    }
    return {
      texts: translations.map((item) => {
        if (typeof item.Translation !== "string") {
          throw new TranslateError(
            "parse",
            "Volcengine response is missing translated text.",
            {
              serviceId: this.id,
              retryable: false,
            },
          );
        }
        return item.Translation;
      }),
    };
  }
}
