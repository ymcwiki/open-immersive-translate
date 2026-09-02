import type { TranslateRequest, TranslateResult } from "../../shared/types";
import { BaseService } from "./base";

/** User-templated HTTP translation adapter. */
export class CustomHttpService extends BaseService {
  constructor() {
    super({
      id: "custom-http",
      name: "Custom HTTP",
      maxBatchSize: 20,
      maxBatchChars: 8_000,
      rateLimit: { rps: 2, concurrency: 2 },
      placeholder: { open: "{", close: "}" },
    });
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<TranslateResult> {
    // TODO(phase1:services): Implement the custom HTTP adapter.
    void request;
    void signal;
    throw new Error("NotImplemented");
  }
}
