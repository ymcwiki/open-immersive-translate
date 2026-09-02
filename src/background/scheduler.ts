import type {
  ParagraphTranslationResult,
  TranslateMessage,
  TranslateResultMessage,
} from "../shared/messages";
import type {
  Config,
  GlossaryEntry,
  LangCode,
  TranslateParagraph,
  TranslationContext,
} from "../shared/types";
import { translationCache, type TranslationCacheKey } from "./cache";
import type { TranslationCache } from "./cache";
import {
  TranslateError,
  serializeTranslateError,
  type ServiceTranslateResult,
  type TranslationService,
} from "./services/base";
import { createService, getService } from "./services";

const RETRY_DELAY_MS = 250;

export interface SchedulerParagraph extends TranslateParagraph {
  priority?: boolean;
}

export interface TranslateParagraphsRequest {
  tabId: number;
  requestId?: string;
  items: SchedulerParagraph[];
  from: LangCode;
  to: LangCode;
  serviceId: string;
  glossary?: GlossaryEntry[];
  context?: TranslationContext;
  onResult(batchResults: ParagraphTranslationResult[]): void | Promise<void>;
  signal?: AbortSignal;
}

export interface TranslationSchedulerOptions {
  cache?: TranslationCache;
  services?: Iterable<TranslationService>;
  fallbackServices?: Record<string, string>;
  configProvider?: () => Promise<Config>;
}

interface QueueJob<T> {
  signal: AbortSignal;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  started: boolean;
  abort: () => void;
}

interface BatchValue {
  text?: string;
  error?: unknown;
}

function cancellationError(serviceId?: string): TranslateError {
  return new TranslateError("aborted", "Translation was cancelled.", {
    serviceId,
    retryable: false,
  });
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(cancellationError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = (): void => {
      clearTimeout(timeout);
      reject(cancellationError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

class ServiceQueue {
  private readonly high: QueueJob<unknown>[] = [];
  private readonly normal: QueueJob<unknown>[] = [];
  private active = 0;
  private nextStartAt = 0;

  constructor(
    private readonly serviceId: string,
    private readonly concurrency: number,
    private readonly rps: number,
  ) {}

  enqueue<T>(
    run: () => Promise<T>,
    priority: boolean,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted)
      return Promise.reject(cancellationError(this.serviceId));

    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        if (job.started) return;
        const queue = priority ? this.high : this.normal;
        const index = queue.indexOf(job as QueueJob<unknown>);
        if (index >= 0) queue.splice(index, 1);
        reject(cancellationError(this.serviceId));
      };
      const job: QueueJob<T> = {
        signal,
        run,
        resolve,
        reject,
        started: false,
        abort,
      };
      signal.addEventListener("abort", abort, { once: true });
      (priority ? this.high : this.normal).push(job as QueueJob<unknown>);
      this.pump();
    });
  }

  private pump(): void {
    while (
      this.active < Math.max(1, this.concurrency) &&
      (this.high.length || this.normal.length)
    ) {
      const job = (this.high.shift() ??
        this.normal.shift()) as QueueJob<unknown>;
      job.started = true;
      job.signal.removeEventListener("abort", job.abort);
      this.active += 1;
      void this.run(job);
    }
  }

  private async run(job: QueueJob<unknown>): Promise<void> {
    try {
      if (job.signal.aborted) throw cancellationError(this.serviceId);
      const interval = 1000 / Math.max(this.rps, 0.001);
      const startAt = Math.max(Date.now(), this.nextStartAt);
      this.nextStartAt = startAt + interval;
      const wait = startAt - Date.now();
      if (wait > 0) await abortableDelay(wait, job.signal);
      if (job.signal.aborted) throw cancellationError(this.serviceId);
      job.resolve(await job.run());
    } catch (error) {
      job.reject(error);
    } finally {
      this.active -= 1;
      this.pump();
    }
  }
}

function itemError(message: string, serviceId: string): TranslateError {
  return new TranslateError("parse", message, {
    serviceId,
    retryable: false,
  });
}

function isRetryable(error: unknown): boolean {
  if (error instanceof TranslateError) {
    return error.code === "NETWORK" || error.code === "RATE_LIMIT";
  }
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    return code === "NETWORK" || code === "RATE_LIMIT";
  }
  return false;
}

function unpackResult(
  result: ServiceTranslateResult,
  count: number,
  serviceId: string,
): BatchValue[] {
  return Array.from({ length: count }, (_, index) => {
    const error = result.errors?.[index];
    if (error) return { error };
    const text = result.texts[index];
    return text === undefined
      ? {
          error: itemError(
            `Translation response is missing item ${index + 1}.`,
            serviceId,
          ),
        }
      : { text };
  });
}

function groupItems(
  items: SchedulerParagraph[],
  maxBatchSize: number,
  maxBatchChars: number,
): SchedulerParagraph[][] {
  const groups: SchedulerParagraph[][] = [];
  let group: SchedulerParagraph[] = [];
  let chars = 0;

  for (const item of items) {
    const full = group.length >= maxBatchSize;
    const tooLong =
      group.length > 0 && chars + item.text.length > maxBatchChars;
    if (full || tooLong) {
      groups.push(group);
      group = [];
      chars = 0;
    }
    group.push(item);
    chars += item.text.length;
  }
  if (group.length) groups.push(group);
  return groups;
}

/** Receives each partial scheduler result in delivery order. */
export type TranslateResultEmitter = (message: TranslateResultMessage) => void;

/** Coordinates batching, limits, retries, fallback, and cancellation. */
export class TranslationScheduler {
  private readonly cache: TranslationCache;
  private readonly injectedServices = new Map<string, TranslationService>();
  private readonly fallbackServices: Record<string, string>;
  private readonly configProvider: () => Promise<Config>;
  private readonly queues = new Map<string, ServiceQueue>();
  private readonly operations = new Map<number, Map<string, AbortController>>();
  private operationSequence = 0;

  constructor(options: TranslationSchedulerOptions = {}) {
    this.cache = options.cache ?? translationCache;
    for (const service of options.services ?? []) {
      this.injectedServices.set(service.id, service);
    }
    this.fallbackServices = options.fallbackServices ?? {};
    this.configProvider =
      options.configProvider ??
      (async () => (await import("../shared/config")).loadConfig());
  }

  async translate(
    request: TranslateMessage,
    emit: TranslateResultEmitter,
  ): Promise<void> {
    const delivered = new Set<string>();
    try {
      const serviceId =
        request.service ?? (await this.configProvider()).service;
      await this.translateParagraphs({
        tabId: request.tabId,
        requestId: request.requestId,
        items: request.paragraphs.map((paragraph) => ({
          ...paragraph,
          priority:
            request.priority !== undefined && request.priority !== "normal",
        })),
        from: request.from,
        to: request.to,
        serviceId,
        onResult: (results) => {
          for (const result of results) delivered.add(result.id);
          emit({
            type: "translateResult",
            requestId: request.requestId,
            results,
            done: false,
          });
        },
      });
      emit({
        type: "translateResult",
        requestId: request.requestId,
        results: [],
        done: true,
      });
    } catch (error) {
      emit({
        type: "translateResult",
        requestId: request.requestId,
        results: request.paragraphs
          .filter((paragraph) => !delivered.has(paragraph.id))
          .map((paragraph) => ({
            id: paragraph.id,
            error: serializeTranslateError(error, request.service),
          })),
        done: true,
      });
    }
  }

  cancel(tabId: number, requestId?: string): void {
    const requests = this.operations.get(tabId);
    if (!requests) return;
    if (requestId) {
      requests.get(requestId)?.abort();
      return;
    }
    for (const controller of requests.values()) controller.abort();
  }

  cancelTab(tabId: number): void {
    this.cancel(tabId);
  }

  async translateParagraphs(
    request: TranslateParagraphsRequest,
  ): Promise<void> {
    const operationId =
      request.requestId ?? `local-${++this.operationSequence}`;
    const controller = new AbortController();
    const externalAbort = (): void => controller.abort(request.signal?.reason);
    if (request.signal?.aborted) controller.abort(request.signal.reason);
    else
      request.signal?.addEventListener("abort", externalAbort, { once: true });

    let requests = this.operations.get(request.tabId);
    if (!requests) {
      requests = new Map();
      this.operations.set(request.tabId, requests);
    }
    requests.set(operationId, controller);

    try {
      if (controller.signal.aborted) throw cancellationError(request.serviceId);
      const { primary, fallback } = await this.resolveServices(
        request.serviceId,
      );
      const cacheKeys = request.items.map((item) =>
        this.cacheKey(primary.id, request.from, request.to, item.text),
      );
      const cached = await this.cache.getMany(cacheKeys);
      if (controller.signal.aborted) throw cancellationError(primary.id);

      const hits: ParagraphTranslationResult[] = [];
      const misses: SchedulerParagraph[] = [];
      request.items.forEach((item, index) => {
        const value = cached[index];
        if (value) hits.push({ id: item.id, text: value.text });
        else misses.push(item);
      });
      if (hits.length) await request.onResult(hits);

      const orderedMisses = misses
        .map((item, index) => ({ item, index }))
        .sort(
          (a, b) =>
            Number(Boolean(b.item.priority)) -
              Number(Boolean(a.item.priority)) || a.index - b.index,
        )
        .map(({ item }) => item);
      const batches = groupItems(
        orderedMisses,
        primary.maxBatchSize,
        primary.maxBatchChars,
      );

      await Promise.all(
        batches.map(async (batch) => {
          const priority = batch.some((item) => item.priority);
          let values = await this.executeWithRetry(
            primary,
            batch.map((item) => item.text),
            request,
            priority,
            controller.signal,
          );
          if (controller.signal.aborted) throw cancellationError(primary.id);

          const failed = values
            .map((value, index) => (value.error ? index : -1))
            .filter((index) => index >= 0);
          if (fallback && failed.length) {
            const fallbackValues = await this.executeWithRetry(
              fallback,
              failed.map((index) => batch[index].text),
              request,
              priority,
              controller.signal,
            );
            values = [...values];
            failed.forEach((batchIndex, fallbackIndex) => {
              values[batchIndex] = fallbackValues[fallbackIndex];
            });
          }
          if (controller.signal.aborted) throw cancellationError(primary.id);

          const cacheEntries = values.flatMap((value, index) =>
            value.error || value.text === undefined
              ? []
              : [
                  {
                    key: this.cacheKey(
                      primary.id,
                      request.from,
                      request.to,
                      batch[index].text,
                    ),
                    value: { text: value.text, ts: Date.now() },
                  },
                ],
          );
          if (cacheEntries.length) await this.cache.setMany(cacheEntries);

          await request.onResult(
            batch.map((item, index) => {
              const value = values[index];
              return value.error
                ? {
                    id: item.id,
                    error: serializeTranslateError(value.error, primary.id),
                  }
                : { id: item.id, text: value.text ?? "" };
            }),
          );
        }),
      );
    } finally {
      request.signal?.removeEventListener("abort", externalAbort);
      const tabRequests = this.operations.get(request.tabId);
      tabRequests?.delete(operationId);
      if (!tabRequests?.size) this.operations.delete(request.tabId);
    }
  }

  private cacheKey(
    serviceId: string,
    from: LangCode,
    to: LangCode,
    text: string,
  ): TranslationCacheKey {
    return { serviceId, from, to, text };
  }

  private queueFor(service: TranslationService): ServiceQueue {
    let queue = this.queues.get(service.id);
    if (!queue) {
      queue = new ServiceQueue(
        service.id,
        service.rateLimit.concurrency,
        service.rateLimit.rps,
      );
      this.queues.set(service.id, queue);
    }
    return queue;
  }

  private async executeWithRetry(
    service: TranslationService,
    texts: string[],
    request: Pick<
      TranslateParagraphsRequest,
      "from" | "to" | "glossary" | "context"
    >,
    priority: boolean,
    signal: AbortSignal,
  ): Promise<BatchValue[]> {
    const call = async (callTexts: string[]): Promise<BatchValue[]> => {
      try {
        const result = await this.queueFor(service).enqueue(
          () =>
            service.translate(
              {
                texts: callTexts,
                from: request.from,
                to: request.to,
                glossary: request.glossary,
                context: request.context,
              },
              signal,
            ),
          priority,
          signal,
        );
        if (signal.aborted) throw cancellationError(service.id);
        return unpackResult(result, callTexts.length, service.id);
      } catch (error) {
        if (signal.aborted) throw cancellationError(service.id);
        return callTexts.map(() => ({ error }));
      }
    };

    const first = await call(texts);
    const retryIndexes = first
      .map((value, index) =>
        value.error && isRetryable(value.error) ? index : -1,
      )
      .filter((index) => index >= 0);
    if (!retryIndexes.length) return first;

    await abortableDelay(RETRY_DELAY_MS, signal);
    const retried = await call(retryIndexes.map((index) => texts[index]));
    const merged = [...first];
    retryIndexes.forEach((originalIndex, retryIndex) => {
      merged[originalIndex] = retried[retryIndex];
    });
    return merged;
  }

  private async resolveServices(serviceId: string): Promise<{
    primary: TranslationService;
    fallback?: TranslationService;
  }> {
    const injected = this.injectedServices.get(serviceId);
    const explicitFallback = this.fallbackServices[serviceId];
    if (injected) {
      return {
        primary: injected,
        fallback: explicitFallback
          ? (this.injectedServices.get(explicitFallback) ??
            getService(explicitFallback))
          : undefined,
      };
    }

    const config = await this.configProvider();
    const serviceConfig = config.services[serviceId];
    const primary = serviceConfig
      ? createService(serviceId, serviceConfig)
      : getService(serviceId);
    if (!primary) {
      throw new TranslateError(
        "invalid_config",
        `Translation service ${serviceId} is not configured.`,
        { serviceId, retryable: false },
      );
    }

    const fallbackId = explicitFallback ?? serviceConfig?.fallbackService;
    if (!fallbackId) return { primary };
    const fallbackConfig = config.services[fallbackId];
    return {
      primary,
      fallback:
        this.injectedServices.get(fallbackId) ??
        (fallbackConfig
          ? createService(fallbackId, fallbackConfig)
          : getService(fallbackId)),
    };
  }
}

const defaultScheduler = new TranslationScheduler();

export async function translateParagraphs(
  request: TranslateParagraphsRequest,
): Promise<void> {
  await defaultScheduler.translateParagraphs(request);
}

export function cancelTab(tabId: number): void {
  defaultScheduler.cancelTab(tabId);
}
