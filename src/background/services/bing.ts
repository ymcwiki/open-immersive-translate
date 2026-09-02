import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
  fetchWithTimeout,
  responseError,
} from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
import { assertPair, supportsPair } from "./mt-utils";

export interface BingServiceOptions {
  id?: string;
  name?: string;
  authUrl?: string;
  baseUrl?: string;
  timeoutMs?: number;
  tokenTtlMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface BingResponseItem {
  translations?: Array<{ text?: unknown }>;
}

/** Free Bing Edge translator using Microsoft's short-lived bearer token. */
export class BingService extends BaseService {
  private readonly authUrl: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly tokenTtlMs: number;
  private token?: { value: string; expiresAt: number };

  constructor(options: BingServiceOptions = {}) {
    super({
      id: options.id ?? "bing",
      name: options.name ?? "Bing / Edge",
      maxBatchSize: options.maxBatchSize ?? 100,
      maxBatchChars: options.maxBatchChars ?? 50_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 20,
        concurrency: options.rateLimit?.concurrency ?? 10,
      },
      placeholder: { open: "<code>", close: "</code>" },
    });
    this.authUrl =
      options.authUrl ?? "https://edge.microsoft.com/translate/auth";
    this.baseUrl =
      options.baseUrl ??
      "https://api-edge.cognitive.microsofttranslator.com/translate";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.tokenTtlMs = options.tokenTtlMs ?? 8 * 60_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.bing);
  }

  private async authToken(
    signal: AbortSignal,
    refresh = false,
  ): Promise<string> {
    if (!refresh && this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    const response = await fetchWithTimeout(
      this.authUrl,
      { method: "GET" },
      signal,
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw await responseError(response, this.id);
    const value = (await response.text()).trim();
    if (!value) {
      throw new TranslateError(
        "parse",
        "Bing authentication returned an empty token.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    this.token = { value, expiresAt: Date.now() + this.tokenTtlMs };
    return value;
  }

  private async request(
    url: string,
    texts: readonly string[],
    token: string,
    signal: AbortSignal,
  ): Promise<Response> {
    return fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(texts.map((Text) => ({ Text }))),
      },
      signal,
      this.timeoutMs,
      this.id,
    );
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { from, to } = assertPair(request, LANGUAGE_MAPS.bing, this.id);
    const params = new URLSearchParams({
      "api-version": "3.0",
      to,
      textType: "html",
    });
    if (from !== "auto") params.set("from", from);
    const url = `${this.baseUrl}?${params}`;
    let response = await this.request(
      url,
      request.texts,
      await this.authToken(signal),
      signal,
    );
    if (response.status === 401 || response.status === 403) {
      response = await this.request(
        url,
        request.texts,
        await this.authToken(signal, true),
        signal,
      );
    }
    if (!response.ok) throw await responseError(response, this.id);
    let data: BingResponseItem[];
    try {
      data = (await response.json()) as BingResponseItem[];
    } catch (error) {
      throw new TranslateError("parse", "Bing response is invalid JSON.", {
        serviceId: this.id,
        retryable: false,
        cause: error,
      });
    }
    if (!Array.isArray(data) || data.length !== request.texts.length) {
      throw new TranslateError(
        "parse",
        "Bing response item count does not match.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    return {
      texts: data.map((item) => {
        const text = item.translations?.[0]?.text;
        if (typeof text !== "string") {
          throw new TranslateError(
            "parse",
            "Bing response is missing translated text.",
            {
              serviceId: this.id,
              retryable: false,
            },
          );
        }
        return text;
      }),
    };
  }
}
