import type { TranslateRequest, TranslateResult } from "../../shared/types";
import { BaseService } from "./base";

/** DeepLX-compatible endpoint adapter. */
export class DeepLXService extends BaseService {
  constructor() {
    super({
      id: "deeplx",
      name: "DeepLX",
      maxBatchSize: 20,
      maxBatchChars: 5_000,
      rateLimit: { rps: 3, concurrency: 2 },
      placeholder: { open: "<b>", close: "</b>" },
    });
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<TranslateResult> {
    // TODO(phase1:services): Implement the DeepLX adapter.
    void request;
    void signal;
    throw new Error("NotImplemented");
  }
}
