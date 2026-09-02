import type { LangCode, TranslateRequest } from "../../shared/types";
import {
  type ServiceTranslateResult,
  TranslateError,
  fetchWithTimeout,
  mapWithConcurrency,
  parseJsonResponse,
  responseError,
} from "./base";
import {
  providerLanguage,
  supportsMappedPair,
  type ProviderLanguageMap,
} from "./language-pairs";

export function assertPair(
  request: TranslateRequest,
  map: ProviderLanguageMap,
  serviceId: string,
): { from: string; to: string } {
  const from = providerLanguage(request.from, map);
  const to = providerLanguage(request.to, map);
  if (
    from === undefined ||
    !to ||
    !supportsMappedPair(request.from, request.to, map)
  ) {
    throw new TranslateError(
      "invalid_config",
      `${serviceId} does not support ${request.from} to ${request.to}.`,
      { serviceId, retryable: false },
    );
  }
  return { from, to };
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
  serviceId: string,
): Promise<unknown> {
  const response = await fetchWithTimeout(
    url,
    init,
    signal,
    timeoutMs,
    serviceId,
  );
  if (!response.ok) throw await responseError(response, serviceId);
  return parseJsonResponse(response, serviceId);
}

export async function translateOneByOne(
  request: TranslateRequest,
  concurrency: number,
  translate: (text: string, index: number) => Promise<string>,
): Promise<ServiceTranslateResult> {
  return {
    texts: await mapWithConcurrency(request.texts, concurrency, translate),
  };
}

export function translatedString(
  value: unknown,
  serviceId: string,
  message = "Translation response is missing translated text.",
): string {
  if (typeof value === "string") return value;
  throw new TranslateError("parse", message, { serviceId, retryable: false });
}

export function supportsPair(
  from: LangCode,
  to: LangCode,
  map: ProviderLanguageMap,
): boolean {
  return supportsMappedPair(from, to, map);
}

export function randomId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
