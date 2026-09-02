import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
import {
  assertPair,
  fetchJson,
  supportsPair,
  translateOneByOne,
  translatedString,
} from "./mt-utils";

export interface PapagoServiceOptions {
  id?: string;
  name?: string;
  appId?: string;
  secret?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface PapagoResponse {
  translatedText?: unknown;
  message?: { result?: { translatedText?: unknown } };
}

export class PapagoService extends BaseService {
  private readonly appId?: string;
  private readonly secret?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: PapagoServiceOptions = {}) {
    super({
      id: options.id ?? "papago",
      name: options.name ?? "Papago",
      maxBatchSize: options.maxBatchSize ?? 10,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 5,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "{", close: "}" },
    });
    this.appId = options.appId;
    this.secret = options.secret;
    this.baseUrl =
      options.baseUrl ?? "https://papago.apigw.ntruss.com/nmt/v1/translation";
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.papago);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    if (!this.appId || !this.secret) {
      throw new TranslateError(
        "invalid_config",
        "Papago requires client ID and secret.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    const { from, to } = assertPair(request, LANGUAGE_MAPS.papago, this.id);
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
              "X-NCP-APIGW-API-KEY-ID": this.appId as string,
              "X-NCP-APIGW-API-KEY": this.secret as string,
            },
            body: JSON.stringify({ source: from, target: to, text }),
          },
          signal,
          this.timeoutMs,
          this.id,
        )) as PapagoResponse;
        return translatedString(
          data.translatedText ?? data.message?.result?.translatedText,
          this.id,
        );
      },
    );
  }
}
