import type {
  LangCode,
  PlaceholderStyle,
  RateLimit,
  TranslateRequest,
  TranslateResult,
} from "../../shared/types";

/** Background adapter contract; kept structurally identical to the shared contract. */
export interface TranslationService {
  readonly id: string;
  readonly name: string;
  readonly maxBatchSize: number;
  readonly maxBatchChars: number;
  readonly rateLimit: RateLimit;
  readonly placeholder: PlaceholderStyle;
  supportsLangs?(from: LangCode, to: LangCode): boolean;
  translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<TranslateResult>;
}

/** Constructor values shared by all service adapters. */
export interface BaseServiceOptions {
  id: string;
  name: string;
  maxBatchSize: number;
  maxBatchChars: number;
  rateLimit: RateLimit;
  placeholder: PlaceholderStyle;
}

/** Common immutable limits and default language support for service adapters. */
export abstract class BaseService implements TranslationService {
  readonly id: string;
  readonly name: string;
  readonly maxBatchSize: number;
  readonly maxBatchChars: number;
  readonly rateLimit: RateLimit;
  readonly placeholder: PlaceholderStyle;

  protected constructor(options: BaseServiceOptions) {
    this.id = options.id;
    this.name = options.name;
    this.maxBatchSize = options.maxBatchSize;
    this.maxBatchChars = options.maxBatchChars;
    this.rateLimit = options.rateLimit;
    this.placeholder = options.placeholder;
  }

  supportsLangs(from: LangCode, to: LangCode): boolean {
    return from !== to;
  }

  abstract translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<TranslateResult>;
}
