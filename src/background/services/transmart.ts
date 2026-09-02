import type { LangCode, RateLimit, TranslateRequest } from "../../shared/types";
import {
  BaseService,
  type ServiceTranslateResult,
  TranslateError,
} from "./base";
import { LANGUAGE_MAPS } from "./language-pairs";
import { assertPair, fetchJson, randomId, supportsPair } from "./mt-utils";

export interface TransmartServiceOptions {
  id?: string;
  name?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

interface TransmartResponse {
  auto_translation?: unknown;
  target?: { text_list?: unknown };
  message?: string;
}

/** Tencent Transmart's public web endpoint; no stability guarantee is provided. */
export class TransmartService extends BaseService {
  readonly limited = true;
  readonly limitation =
    "Public web endpoint; may require site-side changes without notice.";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: TransmartServiceOptions = {}) {
    super({
      id: options.id ?? "transmart",
      name: options.name ?? "Transmart (limited)",
      maxBatchSize: options.maxBatchSize ?? 20,
      maxBatchChars: options.maxBatchChars ?? 5_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 2,
        concurrency: options.rateLimit?.concurrency ?? 2,
      },
      placeholder: { open: "#", close: "#" },
    });
    this.baseUrl = options.baseUrl ?? "https://transmart.qq.com/api/imt";
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.transmart);
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (!request.texts.length) return { texts: [] };
    const { from, to } = assertPair(request, LANGUAGE_MAPS.transmart, this.id);
    const data = (await fetchJson(
      this.baseUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header: { fn: "auto_translation", session: randomId() },
          type: "plain",
          model_category: "normal",
          source: { lang: from, text_list: request.texts },
          target: { lang: to },
        }),
      },
      signal,
      this.timeoutMs,
      this.id,
    )) as TransmartResponse;
    const values = data.target?.text_list ?? data.auto_translation;
    const texts = Array.isArray(values)
      ? values.map((value) =>
          typeof value === "string"
            ? value
            : ((value as { text?: unknown; translation?: unknown })
                ?.translation ?? (value as { text?: unknown })?.text),
        )
      : undefined;
    if (
      !texts ||
      texts.length !== request.texts.length ||
      texts.some((text) => typeof text !== "string")
    ) {
      throw new TranslateError(
        "parse",
        data.message ?? "Transmart response item count does not match.",
        {
          serviceId: this.id,
          retryable: false,
        },
      );
    }
    return { texts: texts as string[] };
  }
}
