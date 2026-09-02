import type {
  JsonValue,
  LangCode,
  PlaceholderStyle,
  RateLimit,
  TranslateError as SerializedTranslateError,
  TranslateErrorCode,
  TranslateRequest,
  TranslateResult,
} from "../../shared/types";

export type TranslateErrorKind =
  | "network"
  | "auth"
  | "rate_limit"
  | "parse"
  | "refused"
  | "timeout"
  | "aborted"
  | "invalid_config"
  | "unknown";

const ERROR_CODES: Record<TranslateErrorKind, TranslateErrorCode> = {
  network: "NETWORK",
  auth: "AUTH",
  rate_limit: "RATE_LIMIT",
  parse: "BAD_RESPONSE",
  refused: "CONTENT_BLOCKED",
  timeout: "TIMEOUT",
  aborted: "ABORTED",
  invalid_config: "INVALID_CONFIG",
  unknown: "UNKNOWN",
};

/** Error thrown by service adapters and serialized by the scheduler. */
export class TranslateError extends Error implements SerializedTranslateError {
  readonly code: TranslateErrorCode;
  readonly retryable: boolean;
  readonly serviceId?: string;
  readonly details?: JsonValue;
  readonly kind: TranslateErrorKind;

  constructor(
    kind: TranslateErrorKind,
    message: string,
    options: {
      serviceId?: string;
      retryable?: boolean;
      details?: JsonValue;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "TranslateError";
    this.kind = kind;
    this.code = ERROR_CODES[kind];
    this.retryable =
      options.retryable ??
      (kind === "network" || kind === "rate_limit" || kind === "timeout");
    this.serviceId = options.serviceId;
    this.details = options.details;
  }

  toJSON(): SerializedTranslateError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.serviceId ? { serviceId: this.serviceId } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/** Local result extension used until aligned item errors enter the shared contract. */
export interface ServiceTranslateResult extends TranslateResult {
  errors?: Array<TranslateError | undefined>;
}

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
  ): Promise<ServiceTranslateResult>;
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
  ): Promise<ServiceTranslateResult>;
}

/** Fetch with external cancellation and a service-local timeout. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
  serviceId: string,
): Promise<Response> {
  if (signal.aborted) {
    throw new TranslateError("aborted", "Translation was cancelled.", {
      serviceId,
      retryable: false,
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  const abort = (): void => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (signal.aborted) {
      throw new TranslateError("aborted", "Translation was cancelled.", {
        serviceId,
        retryable: false,
        cause: error,
      });
    }
    if (timedOut) {
      throw new TranslateError("timeout", "Translation request timed out.", {
        serviceId,
        cause: error,
      });
    }
    if (error instanceof TranslateError) throw error;
    throw new TranslateError("network", "Translation request failed.", {
      serviceId,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

/** Convert an HTTP failure into a stable service error. */
export async function responseError(
  response: Response,
  serviceId: string,
): Promise<TranslateError> {
  let body = "";
  try {
    body = (await response.text()).slice(0, 500);
  } catch {
    // The status still carries enough information to classify the error.
  }

  const details: JsonValue = {
    status: response.status,
    ...(body ? { body } : {}),
  };
  if (response.status === 401 || response.status === 403) {
    return new TranslateError(
      "auth",
      "Translation service rejected the credentials.",
      {
        serviceId,
        retryable: false,
        details,
      },
    );
  }
  if (response.status === 429) {
    return new TranslateError(
      "rate_limit",
      "Translation service rate limit exceeded.",
      {
        serviceId,
        details,
      },
    );
  }
  return new TranslateError(
    "network",
    `Translation service returned HTTP ${response.status}.`,
    {
      serviceId,
      retryable: response.status >= 500,
      details,
    },
  );
}

/** Parse a JSON response without leaking SyntaxError across the service boundary. */
export async function parseJsonResponse(
  response: Response,
  serviceId: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new TranslateError(
      "parse",
      "Translation service returned invalid JSON.",
      {
        serviceId,
        retryable: false,
        cause: error,
      },
    );
  }
}

export function serializeTranslateError(
  error: unknown,
  serviceId?: string,
): SerializedTranslateError {
  if (error instanceof TranslateError) return error.toJSON();

  if (typeof error === "object" && error !== null) {
    const candidate = error as Partial<SerializedTranslateError>;
    if (
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    ) {
      return {
        code: candidate.code as TranslateErrorCode,
        message: candidate.message,
        retryable: candidate.retryable ?? false,
        serviceId: candidate.serviceId ?? serviceId,
        details: candidate.details,
      };
    }
  }

  return new TranslateError(
    "unknown",
    error instanceof Error ? error.message : "Unknown translation error.",
    { serviceId, retryable: false, cause: error },
  ).toJSON();
}

/** Map values with a fixed worker count while preserving input order. */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, Math.floor(concurrency)), values.length) },
      worker,
    ),
  );
  return results;
}
