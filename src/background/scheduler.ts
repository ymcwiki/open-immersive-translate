import type {
  TranslateMessage,
  TranslateResultMessage,
} from "../shared/messages";

/** Receives each partial scheduler result in delivery order. */
export type TranslateResultEmitter = (message: TranslateResultMessage) => void;

/** Coordinates batching, limits, retries, fallback, and cancellation. */
export class TranslationScheduler {
  async translate(
    request: TranslateMessage,
    emit: TranslateResultEmitter,
  ): Promise<void> {
    // TODO(phase1:services): Implement scheduling, caching, and fallback.
    void request;
    void emit;
    throw new Error("NotImplemented");
  }

  cancel(tabId: number, requestId?: string): void {
    // TODO(phase1:services): Abort matching queued and active requests.
    void tabId;
    void requestId;
  }
}
