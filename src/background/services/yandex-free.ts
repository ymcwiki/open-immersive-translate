import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
import { assertPair, fetchJson, supportsPair } from "./mt-utils";

export interface YandexFreeServiceOptions {
  id?: string;
  name?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface YandexResponse {
  text?: unknown[];
  message?: string;
}

/** Undocumented browser endpoint. It may be throttled or changed without notice. */
export class YandexFreeService extends BaseService {
  readonly limited = true;
  readonly limitation =
    "Undocumented session-less endpoint; availability is not guaranteed.";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: YandexFreeServiceOptions = {}) {
    super({
      id: options.id ?? "yandex-free",
      name: options.name ?? "Yandex Free (limited)",
      maxBatchSize: options.maxBatchSize ?? 20,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 2,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "<code>", close: "</code>" },
    });
    this.baseUrl =
      options.baseUrl ??
      "https://translate.yandex.net/api/v1/tr.json/translate";
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.yandex);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { from, to } = assertPair(request, LANGUAGE_MAPS.yandex, this.id);
    const form = new URLSearchParams({
      lang: from === "auto" ? to : `${from}-${to}`,
      options: "1",
    });
    for (const text of request.texts) form.append("text", text);
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
    )) as YandexResponse;
    if (
      !Array.isArray(data.text) ||
      data.text.length !== request.texts.length ||
      data.text.some((text) => typeof text !== "string")
    ) {
      throw new TranslateError(
        "parse",
        data.message ?? "Yandex response item count does not match.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    return { texts: data.text as string[] };
  }
}
