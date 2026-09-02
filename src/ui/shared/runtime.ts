import browser from "webextension-polyfill";

import type { ServiceConfig } from "../../shared/types";

export interface ServiceTestResult {
  ok: boolean;
  message?: string;
}

interface CacheStatsResult {
  count: number;
}

interface ClearCacheResult {
  cleared: number;
}

/** Temporary UI adapter pending typed phase-1 background message contracts. */
export async function testServiceConnection(
  serviceId: string,
  config: ServiceConfig,
): Promise<ServiceTestResult | undefined> {
  const response: unknown = await browser.runtime.sendMessage({
    type: "testService",
    serviceId,
    config,
  });
  if (!isRecord(response) || typeof response.ok !== "boolean") return undefined;
  return {
    ok: response.ok,
    message:
      typeof response.message === "string" ? response.message : undefined,
  };
}

export async function getCacheCount(): Promise<number | undefined> {
  const response: unknown = await browser.runtime.sendMessage({
    type: "getCacheStats",
  });
  return isCacheStats(response) ? response.count : undefined;
}

export async function clearCache(): Promise<number | undefined> {
  const response: unknown = await browser.runtime.sendMessage({
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
