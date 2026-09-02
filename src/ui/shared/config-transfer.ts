import { configSchema } from "../../shared/config";
import type { Config } from "../../shared/types";

export type ConfigImportResult =
  | { ok: true; config: Config }
  | { ok: false; reason: "invalid-json" | "invalid-schema" };

export function serializeConfig(
  config: Config,
  redactApiKeys: boolean,
): string {
  const services = Object.fromEntries(
    Object.entries(config.services).map(([id, service]) => [
      id,
      redactApiKeys ? { ...service, apiKey: undefined } : service,
    ]),
  );
  return JSON.stringify({ ...config, services }, null, 2);
}

export function parseConfigImport(text: string): ConfigImportResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  const parsed = configSchema.safeParse(value);
  return parsed.success
    ? { ok: true, config: parsed.data }
    : { ok: false, reason: "invalid-schema" };
}
