import type { TranslateRequest, TranslateResult } from "../../shared/types";
import { BaseService } from "./base";

/** Anthropic Claude Messages API adapter. */
export class ClaudeService extends BaseService {
  constructor() {
    super({
      id: "claude",
      name: "Claude",
      maxBatchSize: 20,
      maxBatchChars: 12_000,
      rateLimit: { rps: 2, concurrency: 2 },
      placeholder: { open: "{", close: "}" },
    });
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<TranslateResult> {
    // TODO(phase1:services): Implement the Claude adapter.
    void request;
    void signal;
    throw new Error("NotImplemented");
  }
}
