import type { TranslateRequest, TranslateResult } from "../../shared/types";
import { BaseService } from "./base";

/** Google free translation endpoint adapter. */
export class GoogleService extends BaseService {
  constructor() {
    super({
      id: "google",
      name: "Google",
      maxBatchSize: 50,
      maxBatchChars: 5_000,
      rateLimit: { rps: 5, concurrency: 3 },
      placeholder: { open: "<b>", close: "</b>" },
    });
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<TranslateResult> {
    // TODO(phase1:services): Implement the Google adapter.
    void request;
    void signal;
    throw new Error("NotImplemented");
  }
}
