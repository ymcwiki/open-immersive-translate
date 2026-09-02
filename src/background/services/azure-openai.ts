import type { LangCode } from "../../shared/types";
import { LANGUAGE_MAPS } from "./language-pairs";
import {
  OpenAICompatibleService,
  type OpenAICompatibleServiceOptions,
} from "./openai-compatible";
import { supportsPair } from "./mt-utils";

export interface AzureOpenAIServiceOptions extends Omit<
  OpenAICompatibleServiceOptions,
  "apiPath" | "headers"
> {
  deployment?: string;
  apiVersion?: string;
  headers?: Record<string, string>;
}

function deploymentBase(baseUrl: string, deployment: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (/\/openai\/deployments\/[^/]+$/i.test(base)) return base;
  return `${base}/openai/deployments/${encodeURIComponent(deployment)}`;
}

/** Azure OpenAI chat-completions adapter using deployment-scoped URLs. */
export class AzureOpenAIService extends OpenAICompatibleService {
  constructor(options: AzureOpenAIServiceOptions = {}) {
    const apiKey = options.apiKey;
    const baseUrl = deploymentBase(
      options.baseUrl ?? "https://example-resource.openai.azure.com",
      options.deployment ?? "deployment",
    );
    super({
      ...options,
      id: options.id ?? "azure-openai",
      name: options.name ?? "Azure OpenAI",
      apiKey: undefined,
      baseUrl,
      apiPath: `/chat/completions?api-version=${encodeURIComponent(
        options.apiVersion ?? "2024-10-21",
      )}`,
      headers: {
        ...(apiKey ? { "api-key": apiKey } : {}),
        ...options.headers,
      },
    });
  }

  override supportsPair(from: LangCode, to: LangCode): boolean {
    return supportsPair(from, to, LANGUAGE_MAPS.ai);
  }
}
