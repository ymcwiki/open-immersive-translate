import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { loadConfig, onConfigChange, saveConfig } from "../../shared/config";
import type { Config, ConfigPatch } from "../../shared/types";

type PatchFactory = (config: Config) => ConfigPatch;

interface ConfigState {
  config?: Config;
  error?: Error;
  updateConfig: (patch: ConfigPatch | PatchFactory) => Promise<Config>;
}

/** Load configuration once, subscribe to external changes, and persist patches. */
export function useConfig(): ConfigState {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState<Error>();
  const configRef = useRef<Config>();
  const saveQueue = useRef(Promise.resolve());

  const applyConfig = useCallback((next: Config) => {
    configRef.current = next;
    setConfig(next);
    setError(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = onConfigChange((next) => {
      if (active) applyConfig(next);
    });

    void loadConfig()
      .then((next) => {
        if (active) applyConfig(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(asError(cause));
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyConfig]);

  const updateConfig = useCallback(
    async (patchOrFactory: ConfigPatch | PatchFactory): Promise<Config> => {
      const current = configRef.current;
      if (!current) throw new Error("Configuration is not loaded");

      const patch =
        typeof patchOrFactory === "function"
          ? patchOrFactory(current)
          : patchOrFactory;
      const optimistic = { ...current, ...patch } as Config;
      applyConfig(optimistic);

      let resolveResult: (value: Config) => void;
      let rejectResult: (reason: Error) => void;
      const result = new Promise<Config>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const saved = await saveConfig(patch);
          if (configRef.current === optimistic) applyConfig(saved);
          resolveResult(saved);
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
