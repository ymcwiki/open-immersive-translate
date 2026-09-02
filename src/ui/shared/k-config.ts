import type { Config, ConfigPatch } from "../../shared/types";
import { useConfig } from "./use-config";

export type KConfigPatch = ConfigPatch;
export type KConfigPatchFactory = (config: Config) => KConfigPatch;
export type KConfigUpdater = (
  patch: KConfigPatch | KConfigPatchFactory,
) => Promise<Config>;

/** Compatibility name for K-owned UI code; persistence is now schema-backed. */
export function useKConfig(): ReturnType<typeof useConfig> {
  return useConfig();
}
