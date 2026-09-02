import type { ServiceConfig } from "../../shared/types";

export type PromptVariant = "default" | "subtitle" | "selection";

/** Phase-3 fields pending promotion to the shared ServiceConfig contract. */
export type Phase3ServiceConfig = Omit<ServiceConfig, "kind"> & {
  kind: string;
  region?: string;
  appId?: string;
  secret?: string;
  deployment?: string;
  apiVersion?: string;
  formality: "default" | "more" | "less" | "prefer_more" | "prefer_less";
  promptSystem?: string;
  promptUser?: string;
  models: string[];
  stream: boolean;
};

/** Read phase-3 settings without requiring the frozen shared schema to change first. */
export function phase3Config(config: ServiceConfig): Phase3ServiceConfig {
  const settings = config as unknown as Partial<Phase3ServiceConfig> &
    ServiceConfig;
  return {
    ...settings,
    kind: String(settings.kind),
    formality: settings.formality ?? "default",
    promptSystem: settings.promptSystem ?? settings.prompt,
    models: settings.models ?? [],
    stream: settings.stream ?? false,
  };
}
