import browser from "webextension-polyfill";

import type { Rule } from "../../shared/types";
import { validateRule } from "./match";

export const REMOTE_RULES_ALARM = "imt:remote-rules";
export const REMOTE_RULES_STORAGE_KEY = "remoteRulesCache";
export const REMOTE_RULE_REFRESH_MINUTES = 24 * 60;

const CONFIG_STORAGE_KEY = "config";
const CACHE_VERSION = 1;
const MAX_RESPONSE_CHARS = 1_000_000;

export interface RemoteRuleSubscription {
  url: string;
  enabled: boolean;
}

interface RemoteRuleCacheEntry {
  fetchedAt: number;
  rules: Rule[];
}

interface RemoteRuleCache {
  version: number;
  entries: Record<string, RemoteRuleCacheEntry>;
}

export interface RemoteRulesDependencies {
  fetch?: typeof fetch;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRemoteUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Read the optional frozen-schema extension without trusting stored data. */
export function parseRemoteRuleSubscriptions(
  config: unknown,
): RemoteRuleSubscription[] {
  if (!isRecord(config) || !Array.isArray(config.remoteRules)) return [];

  const seen = new Set<string>();
  return config.remoteRules.flatMap((value) => {
    if (
      !isRecord(value) ||
      !validRemoteUrl(value.url) ||
      typeof value.enabled !== "boolean" ||
      seen.has(value.url)
    ) {
      return [];
    }
    seen.add(value.url);
    return [{ url: value.url, enabled: value.enabled }];
  });
}

function parseCache(value: unknown): RemoteRuleCache {
  if (
    !isRecord(value) ||
    value.version !== CACHE_VERSION ||
    !isRecord(value.entries)
  ) {
    return { version: CACHE_VERSION, entries: {} };
  }

  const entries: Record<string, RemoteRuleCacheEntry> = {};
  for (const [url, entry] of Object.entries(value.entries)) {
    if (
      !validRemoteUrl(url) ||
      !isRecord(entry) ||
      typeof entry.fetchedAt !== "number" ||
      !Array.isArray(entry.rules) ||
      !entry.rules.every((rule) => validateRule(rule).ok)
    ) {
      continue;
    }
    entries[url] = {
      fetchedAt: entry.fetchedAt,
      rules: entry.rules as Rule[],
    };
  }
  return { version: CACHE_VERSION, entries };
}

/** Accept a plain rule array or a versioned feed object containing `rules`. */
export function parseRemoteRulePayload(value: unknown): Rule[] {
  const rules = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.rules)
      ? value.rules
      : undefined;
  if (!rules)
    throw new TypeError("Remote rule feed must contain a rules array.");

  const invalid = rules.find((rule) => !validateRule(rule).ok);
  if (invalid !== undefined) {
    throw new TypeError("Remote rule feed contains an invalid rule.");
  }
  return rules as Rule[];
}

async function fetchRemoteRules(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Rule[]> {
  const response = await fetchImpl(url, {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Remote rule request failed with HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new Error("Remote rule response exceeds 1 MB.");
  }
  return parseRemoteRulePayload(JSON.parse(text) as unknown);
}

async function loadState(): Promise<{
  subscriptions: RemoteRuleSubscription[];
  cache: RemoteRuleCache;
}> {
  const stored = await browser.storage.local.get([
    CONFIG_STORAGE_KEY,
    REMOTE_RULES_STORAGE_KEY,
  ]);
  return {
    subscriptions: parseRemoteRuleSubscriptions(stored[CONFIG_STORAGE_KEY]),
    cache: parseCache(stored[REMOTE_RULES_STORAGE_KEY]),
  };
}

/** Refresh stale enabled feeds atomically per URL and return cached rules in config order. */
async function runRefreshRemoteRules(
  force = false,
  dependencies: RemoteRulesDependencies = {},
): Promise<Rule[]> {
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now?.() ?? Date.now();
  const { subscriptions, cache } = await loadState();
  const enabled = subscriptions.filter((subscription) => subscription.enabled);
  const configuredUrls = new Set(subscriptions.map(({ url }) => url));
  let changed = false;

  for (const cachedUrl of Object.keys(cache.entries)) {
    if (!configuredUrls.has(cachedUrl)) {
      delete cache.entries[cachedUrl];
      changed = true;
    }
  }

  await Promise.all(
    enabled.map(async ({ url }) => {
      const cached = cache.entries[url];
      const isFresh =
        cached !== undefined &&
        now - cached.fetchedAt < REMOTE_RULE_REFRESH_MINUTES * 60_000;
      if (!force && isFresh) return;

      try {
        cache.entries[url] = {
          fetchedAt: now,
          rules: await fetchRemoteRules(url, fetchImpl),
        };
        changed = true;
      } catch (error) {
        console.warn(`[imt] Could not refresh remote rules from ${url}`, error);
      }
    }),
  );

  if (changed) {
    await browser.storage.local.set({ [REMOTE_RULES_STORAGE_KEY]: cache });
  }
  return enabled.flatMap(({ url }) => cache.entries[url]?.rules ?? []);
}

let refreshInFlight: Promise<Rule[]> | undefined;

/** Coalesce concurrent rule requests into one storage read and network refresh. */
export function refreshRemoteRules(
  force = false,
  dependencies: RemoteRulesDependencies = {},
): Promise<Rule[]> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = runRefreshRemoteRules(force, dependencies).finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

/** Load remote rules, refreshing only feeds older than 24 hours. */
export function getRemoteRules(
  dependencies: RemoteRulesDependencies = {},
): Promise<Rule[]> {
  return refreshRemoteRules(false, dependencies);
}

/** Register the alarm and lifecycle hooks used by the background worker. */
export function registerRemoteRules(
  dependencies: RemoteRulesDependencies = {},
): () => void {
  const refresh = (force = false): void => {
    void refreshRemoteRules(force, dependencies).catch((error: unknown) => {
      console.warn("[imt] Remote rule refresh failed", error);
    });
  };
  const onAlarm = (alarm: browser.Alarms.Alarm): void => {
    if (alarm.name === REMOTE_RULES_ALARM) refresh(true);
  };
  const onInstalled = (): void => refresh();
  const onStartup = (): void => refresh();
  const onStorageChange = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ): void => {
    const change = changes[CONFIG_STORAGE_KEY];
    if (areaName !== "local" || !change) return;
    const previous = parseRemoteRuleSubscriptions(change.oldValue);
    const next = parseRemoteRuleSubscriptions(change.newValue);
    if (JSON.stringify(previous) !== JSON.stringify(next)) refresh(true);
  };

  browser.alarms.onAlarm.addListener(onAlarm);
  browser.runtime.onInstalled.addListener(onInstalled);
  browser.runtime.onStartup.addListener(onStartup);
  browser.storage.onChanged.addListener(onStorageChange);
  void browser.alarms.create(REMOTE_RULES_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: REMOTE_RULE_REFRESH_MINUTES,
  });
  refresh();

  return () => {
    browser.alarms.onAlarm.removeListener(onAlarm);
    browser.runtime.onInstalled.removeListener(onInstalled);
    browser.runtime.onStartup.removeListener(onStartup);
    browser.storage.onChanged.removeListener(onStorageChange);
  };
}
