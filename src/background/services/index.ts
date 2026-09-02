import { ClaudeService } from "./claude";
import { CustomHttpService } from "./custom-http";
import { DeepLXService } from "./deeplx";
import { GoogleService } from "./google";
import { OpenAICompatibleService } from "./openai-compatible";
import type { TranslationService } from "./base";

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
