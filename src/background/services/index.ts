import { ClaudeService } from "./claude";
import { CustomHttpService } from "./custom-http";
import { DeepLXService } from "./deeplx";
import { GoogleService } from "./google";
import { OpenAICompatibleService } from "./openai-compatible";
import type { TranslationService } from "./base";
import type { ServiceConfig } from "../../shared/types";

export interface RuntimeServiceConfig extends ServiceConfig {
  apiPath?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  method?: string;
}

const services: readonly TranslationService[] = [
  new OpenAICompatibleService(),
  new ClaudeService(),
  new GoogleService(),
  new DeepLXService(),
  new CustomHttpService(),
];

const servicesById = new Map(services.map((service) => [service.id, service]));

/** Return a registered service by stable id. */
export function getService(id: string): TranslationService | undefined {
  return servicesById.get(id);
}

/** Return all registered translation service adapters. */
export function listServices(): readonly TranslationService[] {
  return [...services];
}

/** Build an adapter from persisted settings while preserving its configured id. */
export function createService(
  id: string,
  config: RuntimeServiceConfig,
): TranslationService {
  const common = {
    id,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    prompt: config.prompt,
    maxBatchSize: config.maxBatchSize,
    maxBatchChars: config.maxBatchChars,
    rateLimit: config.rateLimit,
    headers: config.headers,
    timeoutMs: config.timeoutMs,
  };

  switch (config.kind) {
    case "openai-compatible":
      return new OpenAICompatibleService({
        ...common,
        apiPath: config.apiPath,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        ignoreResRegexs: config.ignoreResRegexs,
      });
    case "claude":
      return new ClaudeService({
        ...common,
        apiPath: config.apiPath,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        ignoreResRegexs: config.ignoreResRegexs,
      });
    case "google":
      return new GoogleService({
        id,
        maxBatchSize: config.maxBatchSize,
        maxBatchChars: config.maxBatchChars,
        rateLimit: config.rateLimit,
        timeoutMs: config.timeoutMs,
      });
    case "deeplx":
      return new DeepLXService(common);
    case "custom-http":
      return new CustomHttpService({
        ...common,
        url: config.baseUrl,
        method: config.method,
        requestBodyTemplate: config.requestBodyTemplate,
        responseJsonPath: config.responseJsonPath,
      });
  }
}
