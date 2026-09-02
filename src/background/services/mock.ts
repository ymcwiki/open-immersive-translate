import type { RateLimit, TranslateRequest } from "../../shared/types";
import type { AssistantRequest } from "../../shared/k-assistant";
import { BaseService, type ServiceTranslateResult } from "./base";

export interface MockServiceOptions {
  id?: string;
  name?: string;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
}

/** Deterministic in-extension adapter used only when explicitly enabled. */
export class MockService extends BaseService {
  constructor(options: MockServiceOptions = {}) {
    super({
      id: options.id ?? "mock",
      name: options.name ?? "Mock",
      maxBatchSize: options.maxBatchSize ?? 100,
      maxBatchChars: options.maxBatchChars ?? 100_000,
      rateLimit: {
        rps: options.rateLimit?.rps ?? 1_000,
        concurrency: options.rateLimit?.concurrency ?? 8,
      },
      placeholder: { open: "{", close: "}" },
    });
  }

  async translate(
    request: TranslateRequest,
    signal: AbortSignal,
  ): Promise<ServiceTranslateResult> {
    if (signal.aborted) throw new Error("Translation was cancelled.");
    return {
      texts: request.texts.map(
        (text) => `[zh] ${applyGlossary(text, request.glossary)}`,
      ),
    };
  }

  async completePrompt(
    request: AssistantRequest,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted) throw new Error("Translation was cancelled.");
    return `[zh] ${request.text}`;
  }

  async onPartial(
    request: AssistantRequest,
    emitCumulativeText: (text: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    const text = await this.completePrompt(request, signal);
    emitCumulativeText(text);
    return text;
  }
}

function applyGlossary(
  text: string,
  glossary: TranslateRequest["glossary"],
): string {
  return (glossary ?? []).reduce(
    (current, entry) =>
      entry.k ? current.split(entry.k).join(entry.v) : current,
    text,
  );
}
