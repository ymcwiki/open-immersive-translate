import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ stored: {} as Record<string, unknown> }));
const listeners = vi.hoisted(() => ({
  alarms: new Set<(alarm: { name: string }) => void>(),
  installed: new Set<() => void>(),
  startup: new Set<() => void>(),
  storage: new Set<
    (changes: Record<string, unknown>, areaName: string) => void
  >(),
}));
const browserMock = vi.hoisted(() => ({
  alarms: {
    create: vi.fn().mockResolvedValue(undefined),
    onAlarm: {
      addListener: vi.fn((listener: (alarm: { name: string }) => void) =>
        listeners.alarms.add(listener),
      ),
      removeListener: vi.fn((listener: (alarm: { name: string }) => void) =>
        listeners.alarms.delete(listener),
      ),
    },
  },
  runtime: {
    onInstalled: {
      addListener: vi.fn((listener: () => void) =>
        listeners.installed.add(listener),
      ),
      removeListener: vi.fn((listener: () => void) =>
        listeners.installed.delete(listener),
      ),
    },
    onStartup: {
      addListener: vi.fn((listener: () => void) =>
        listeners.startup.add(listener),
      ),
      removeListener: vi.fn((listener: () => void) =>
        listeners.startup.delete(listener),
      ),
    },
  },
  storage: {
    local: {
      get: vi.fn(async () => ({ ...state.stored })),
      set: vi.fn(async (value: Record<string, unknown>) => {
        Object.assign(state.stored, value);
      }),
    },
    onChanged: {
      addListener: vi.fn(
        (
          listener: (
            changes: Record<string, unknown>,
            areaName: string,
          ) => void,
        ) => listeners.storage.add(listener),
      ),
      removeListener: vi.fn(
        (
          listener: (
            changes: Record<string, unknown>,
            areaName: string,
          ) => void,
        ) => listeners.storage.delete(listener),
      ),
    },
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import {
  parseRemoteRulePayload,
  parseRemoteRuleSubscriptions,
  refreshRemoteRules,
  registerRemoteRules,
  REMOTE_RULE_REFRESH_MINUTES,
  REMOTE_RULES_ALARM,
  REMOTE_RULES_STORAGE_KEY,
} from "../../src/background/rules/remote-rules";

const remoteUrl = "https://rules.example.com/rules.json";
const remoteRule = {
  id: "remote-example",
  matches: ["*://example.com/*"],
  selectors: ["article"],
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

beforeEach(() => {
  state.stored = {
    config: { remoteRules: [{ url: remoteUrl, enabled: true }] },
  };
  listeners.alarms.clear();
  listeners.installed.clear();
  listeners.startup.clear();
  listeners.storage.clear();
  vi.clearAllMocks();
});

describe("remote rules", () => {
  it("parses only unique HTTP subscriptions and valid rule feeds", () => {
    expect(
      parseRemoteRuleSubscriptions({
        remoteRules: [
          { url: remoteUrl, enabled: true },
          { url: remoteUrl, enabled: false },
          { url: "file:///tmp/rules.json", enabled: true },
          { url: "https://rules.example.com/disabled.json", enabled: false },
        ],
      }),
    ).toEqual([
      { url: remoteUrl, enabled: true },
      { url: "https://rules.example.com/disabled.json", enabled: false },
    ]);
    expect(parseRemoteRulePayload({ rules: [remoteRule] })).toEqual([
      remoteRule,
    ]);
    expect(() => parseRemoteRulePayload([{ matches: [] }])).toThrow(
      "invalid rule",
    );
  });

  it("fetches once per 24 hours and caches the validated rules", async () => {
    const fetchMock = vi.fn(async () => response([remoteRule]));
    const now = 1_800_000_000_000;

    await expect(
      refreshRemoteRules(false, { fetch: fetchMock, now: () => now }),
    ).resolves.toEqual([remoteRule]);
    await expect(
      refreshRemoteRules(false, {
        fetch: fetchMock,
        now: () => now + REMOTE_RULE_REFRESH_MINUTES * 30_000,
      }),
    ).resolves.toEqual([remoteRule]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(state.stored[REMOTE_RULES_STORAGE_KEY]).toMatchObject({
      version: 1,
      entries: {
        [remoteUrl]: { fetchedAt: now, rules: [remoteRule] },
      },
    });
  });

  it("keeps the last valid cache when a refresh fails", async () => {
    const now = 1_800_000_000_000;
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    await refreshRemoteRules(false, {
      fetch: vi.fn(async () => response([remoteRule])),
      now: () => now,
    });

    await expect(
      refreshRemoteRules(true, {
        fetch: vi.fn(async () => response([{ matches: [] }])),
        now: () => now + 1,
      }),
    ).resolves.toEqual([remoteRule]);
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it("does not fetch or return disabled subscriptions", async () => {
    state.stored.config = {
      remoteRules: [{ url: remoteUrl, enabled: false }],
    };
    const fetchMock = vi.fn();

    await expect(
      refreshRemoteRules(true, { fetch: fetchMock }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers a daily alarm and removes every listener", () => {
    const dispose = registerRemoteRules({ fetch: vi.fn() });

    expect(browserMock.alarms.create).toHaveBeenCalledWith(REMOTE_RULES_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: REMOTE_RULE_REFRESH_MINUTES,
    });
    expect(listeners.alarms.size).toBe(1);
    expect(listeners.installed.size).toBe(1);
    expect(listeners.startup.size).toBe(1);
    expect(listeners.storage.size).toBe(1);

    dispose();
    expect(listeners.alarms.size).toBe(0);
    expect(listeners.installed.size).toBe(0);
    expect(listeners.startup.size).toBe(0);
    expect(listeners.storage.size).toBe(0);
  });
});
