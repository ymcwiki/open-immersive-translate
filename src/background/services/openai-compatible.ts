import type { TranslateRequest, TranslateResult } from "../../shared/types";
import { BaseService } from "./base";

/** OpenAI-compatible chat-completions adapter. */
export class OpenAICompatibleService extends BaseService {
  constructor() {
    super({
      id: "openai-compatible",
      name: "OpenAI Compatible",
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
    // TODO(phase1:services): Implement the OpenAI-compatible adapter.
    void request;
    void signal;
    throw new Error("NotImplemented");
  }
}
