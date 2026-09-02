import { migrateConfig } from "../../shared/config";
import type { KConfig } from "../../shared/k-types";
import type { Config } from "../../shared/types";

export type ConfigImportResult =
  | { ok: true; config: KConfig }
  | { ok: false; reason: "invalid-json" | "invalid-schema" };

export function serializeConfig(
  config: Config | KConfig,
  redactApiKeys: boolean,
): string {
  const services = Object.fromEntries(
    Object.entries(config.services).map(([id, service]) => {
      const copy = { ...service } as Record<string, unknown>;
      delete copy.accessToken;
      delete copy.refreshToken;
      delete copy.idToken;
      delete copy.access_token;
      delete copy.refresh_token;
      delete copy.id_token;
      if (redactApiKeys) delete copy.apiKey;
      return [id, copy];
    }),
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

  try {
    return { ok: true, config: migrateConfig(value) };
  } catch {
    return { ok: false, reason: "invalid-schema" };
  }
}
