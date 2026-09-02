import browser from "webextension-polyfill";

import { sendToBackground } from "../../shared/messages";
import type { ServiceTestResult } from "../../shared/messages";
import type { ServiceConfig } from "../../shared/types";

interface CacheStatsResult {
  count: number;
}

interface ClearCacheResult {
  cleared: number;
}

export async function testServiceConnection(
  serviceId: string,
  config: ServiceConfig,
): Promise<ServiceTestResult | undefined> {
  const response: unknown = await sendToBackground({
    type: "testService",
    serviceId,
    config,
  });
  if (
    !isRecord(response) ||
    typeof response.ok !== "boolean" ||
    typeof response.latencyMs !== "number"
  ) {
    return undefined;
  }
  if (response.ok === true && typeof response.sample === "string") {
    return {
      ok: true,
      latencyMs: response.latencyMs,
      sample: response.sample,
    };
  }
  if (response.ok === false && typeof response.error === "string") {
    return {
      ok: false,
      latencyMs: response.latencyMs,
      error: response.error,
    };
  }
  return undefined;
}

export interface BrowserCommandBinding {
  name: string;
  description: string;
  shortcut: string;
}

/** Read live bindings because users change them outside extension storage. */
export async function getBrowserCommandBindings(): Promise<
  BrowserCommandBinding[]
> {
  const commands = (
    browser as unknown as {
      commands?: {
        getAll(): Promise<
          Array<{ name?: string; description?: string; shortcut?: string }>
        >;
      };
    }
  ).commands;
  if (!commands) return [];
  const values = await commands.getAll();
  return values.flatMap((value) =>
    typeof value.name === "string"
      ? [
          {
            name: value.name,
            description: value.description ?? value.name,
            shortcut: value.shortcut ?? "",
          },
        ]
      : [],
  );
}

export async function getCacheCount(): Promise<number | undefined> {
  const response: unknown = await sendToBackground({
    type: "getCacheStats",
  });
  return isCacheStats(response) ? response.count : undefined;
}

export async function clearCache(): Promise<number | undefined> {
  const response: unknown = await sendToBackground({
    type: "clearCache",
  });
  return isClearCacheResult(response) ? response.cleared : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCacheStats(value: unknown): value is CacheStatsResult {
  return (
    isRecord(value) &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 0
  );
}

function isClearCacheResult(value: unknown): value is ClearCacheResult {
  return (
    isRecord(value) &&
    typeof value.cleared === "number" &&
    Number.isInteger(value.cleared) &&
    value.cleared >= 0
  );
}
