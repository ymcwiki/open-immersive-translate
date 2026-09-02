import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import browser from "webextension-polyfill";

import { CONFIG_STORAGE_KEY } from "../../shared/config";
import { withKDefaults, type KConfig } from "../../shared/k-types";

export type KConfigPatch = Partial<Omit<KConfig, "version">>;
export type KConfigPatchFactory = (config: KConfig) => KConfigPatch;
export type KConfigUpdater = (
  patch: KConfigPatch | KConfigPatchFactory,
) => Promise<KConfig>;

interface KConfigState {
  config?: KConfig;
  error?: Error;
  updateConfig: KConfigUpdater;
}

async function loadKConfig(): Promise<KConfig> {
  const stored = await browser.storage.local.get(CONFIG_STORAGE_KEY);
  return withKDefaults(stored[CONFIG_STORAGE_KEY]);
}

/** Persist K-owned fields before the shared Config schema is extended. */
export function useKConfig(): KConfigState {
  const [config, setConfig] = useState<KConfig>();
  const [error, setError] = useState<Error>();
  const configRef = useRef<KConfig>();
  const saveQueue = useRef(Promise.resolve());

  const applyConfig = useCallback((next: KConfig) => {
    configRef.current = next;
    setConfig(next);
    setError(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const listener = (
      changes: Record<string, browser.Storage.StorageChange>,
      areaName: string,
    ): void => {
      const change = changes[CONFIG_STORAGE_KEY];
      if (active && areaName === "local" && change) {
        try {
          applyConfig(withKDefaults(change.newValue));
        } catch (cause) {
          setError(asError(cause));
        }
      }
    };
    browser.storage.onChanged.addListener(listener);
    void loadKConfig()
      .then((next) => {
        if (active) applyConfig(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(asError(cause));
      });

    return () => {
      active = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, [applyConfig]);

  const updateConfig = useCallback<KConfigUpdater>(
    async (patchOrFactory) => {
      const current = configRef.current;
      if (!current) throw new Error("Configuration is not loaded");
      const patch =
        typeof patchOrFactory === "function"
          ? patchOrFactory(current)
          : patchOrFactory;
      const next = withKDefaults({ ...current, ...patch });
      applyConfig(next);

      let resolveResult: (value: KConfig) => void;
      let rejectResult: (reason: Error) => void;
      const result = new Promise<KConfig>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      saveQueue.current = saveQueue.current.then(async () => {
        try {
          await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: next });
          resolveResult(next);
        } catch (cause) {
          const nextError = asError(cause);
          setError(nextError);
          rejectResult(nextError);
        }
      });
      return result;
    },
    [applyConfig],
  );

  return { config, error, updateConfig };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
