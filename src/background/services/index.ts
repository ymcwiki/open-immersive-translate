import { ClaudeService } from "./claude";
import { CustomHttpService } from "./custom-http";
import { DeepLXService } from "./deeplx";
import { GoogleService } from "./google";
import { OpenAICompatibleService } from "./openai-compatible";
import { ChatgptOauthService } from "./chatgpt-oauth/service";
import { MockService } from "./mock";
import { TranslateError, type TranslationService } from "./base";
import type { ServiceConfig } from "../../shared/types";
import { createPhase3Service, registerPhase3Services } from "./phase3";
export {
  getModels,
  serviceFields,
  type ServiceFieldDescriptor,
} from "./service-fields";
export { DEFAULT_PROMPTS } from "./prompts";
export { OPENAI_PROVIDER_PRESETS } from "./presets";

const services: TranslationService[] = [
  new OpenAICompatibleService(),
  new ChatgptOauthService(),
  new ClaudeService(),
  new GoogleService(),
  new DeepLXService(),
  new CustomHttpService(),
  new MockService(),
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

/** Add phase-3 adapters to the registry. Safe to call more than once. */
export function initTranslationServices(): void {
  registerPhase3Services((service) => {
    if (servicesById.has(service.id)) return;
    services.push(service);
    servicesById.set(service.id, service);
  });
}

/** Build an adapter from persisted settings while preserving its configured id. */
export function createService(
  id: string,
  config: ServiceConfig,
): TranslationService {
  const phase3Service = createPhase3Service(id, config);
  if (phase3Service) return phase3Service;

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
    promptSystem: config.promptSystem,
    promptUser: config.promptUser,
    stream: config.stream,
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
    case "chatgpt":
      return new ChatgptOauthService({
        model: config.model,
        prompt: config.prompt,
        promptSystem: config.promptSystem,
        promptUser: config.promptUser,
        timeoutMs: config.timeoutMs,
        maxBatchSize: config.maxBatchSize,
        maxBatchChars: config.maxBatchChars,
        rateLimit: config.rateLimit,
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
    case "mock":
      return new MockService({
        id,
        maxBatchSize: config.maxBatchSize,
        maxBatchChars: config.maxBatchChars,
        rateLimit: config.rateLimit,
      });
    default:
      throw new TranslateError(
        "invalid_config",
        `Unknown translation service kind: ${String(config.kind)}.`,
        { serviceId: id, retryable: false },
      );
  }
}
