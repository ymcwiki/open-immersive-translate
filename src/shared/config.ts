import browser from "webextension-polyfill";
import { z } from "zod";

import { LANGUAGE_CODES } from "./lang";
import type { Config, ConfigPatch, Rule, ServiceConfig } from "./types";

/** Current persisted configuration format. */
export const CONFIG_VERSION = 1;

/** Storage key containing the complete configuration object. */
export const CONFIG_STORAGE_KEY = "config";

const langCodeSchema = z.enum(LANGUAGE_CODES);
const glossarySchema = z.object({ k: z.string(), v: z.string() });
const placeholderSchema = z.object({ open: z.string(), close: z.string() });
const rateLimitSchema = z.object({
  rps: z.number().positive().optional(),
  concurrency: z.number().int().positive().optional(),
});

/** Runtime schema for persisted service settings. */
export const serviceConfigSchema: z.ZodType<ServiceConfig> = z.object({
  kind: z.enum([
    "openai-compatible",
    "claude",
    "google",
    "deeplx",
    "custom-http",
    "mock",
  ]),
  enabled: z.boolean().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  apiPath: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  method: z.string().optional(),
  maxBatchSize: z.number().int().positive().optional(),
  maxBatchChars: z.number().int().positive().optional(),
  rateLimit: rateLimitSchema.optional(),
  placeholder: placeholderSchema.optional(),
  fallbackService: z.string().optional(),
  ignoreResRegexs: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  requestBodyTemplate: z.string().optional(),
  responseJsonPath: z.string().optional(),
});

/** Runtime schema for built-in and user site rules. */
export const ruleSchema: z.ZodType<Rule> = z.object({
  id: z.string().optional(),
  matches: z.array(z.string()),
  excludeMatches: z.array(z.string()).optional(),
  selectorMatches: z.array(z.string()).optional(),
  selectors: z.array(z.string()).optional(),
  excludeSelectors: z.array(z.string()).optional(),
  additionalExcludeSelectors: z.array(z.string()).optional(),
  stayOriginalSelectors: z.array(z.string()).optional(),
  additionalStayOriginalSelectors: z.array(z.string()).optional(),
  atomicBlockSelectors: z.array(z.string()).optional(),
  additionalAtomicBlockSelectors: z.array(z.string()).optional(),
  extraInlineSelectors: z.array(z.string()).optional(),
  additionalExtraInlineSelectors: z.array(z.string()).optional(),
  extraBlockSelectors: z.array(z.string()).optional(),
  additionalExtraBlockSelectors: z.array(z.string()).optional(),
  shadowRootSelectors: z.array(z.string()).optional(),
  additionalShadowRootSelectors: z.array(z.string()).optional(),
  mutationExcludeSelectors: z.array(z.string()).optional(),
  additionalMutationExcludeSelectors: z.array(z.string()).optional(),
  injectedCss: z.array(z.string()).optional(),
  additionalInjectedCss: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  stayOriginalTags: z.array(z.string()).optional(),
  inlineTags: z.array(z.string()).optional(),
  allBlockTags: z.array(z.string()).optional(),
  isTranslateTitle: z.boolean().optional(),
  paragraphMinTextCount: z.number().int().nonnegative().optional(),
  blockMinTextCount: z.number().int().nonnegative().optional(),
  lineBreakMaxTextCount: z.number().int().nonnegative().optional(),
  targetWrapperTag: z.string().optional(),
  wrapperPrefix: z.string().optional(),
  wrapperSuffix: z.string().optional(),
  sameLangCheck: z.boolean().optional(),
  enableRichTranslate: z.boolean().optional(),
  glossaries: z.array(glossarySchema).optional(),
  additionalGlossaries: z.array(glossarySchema).optional(),
  translationMode: z.enum(["dual", "translation"]).optional(),
  theme: z.string().optional(),
  service: z.string().optional(),
  autoTranslate: z.boolean().optional(),
});

const DEFAULT_SERVICES: Record<string, ServiceConfig> = {
  "openai-compatible": { kind: "openai-compatible", enabled: false },
  claude: { kind: "claude", enabled: false },
  google: { kind: "google", enabled: true },
  deeplx: { kind: "deeplx", enabled: false },
  "custom-http": { kind: "custom-http", enabled: false },
  mock: { kind: "mock", enabled: false },
};

/** Runtime schema for the complete local configuration, including defaults. */
export const configSchema: z.ZodType<Config> = z.object({
  version: z.number().int().nonnegative().default(CONFIG_VERSION),
  targetLanguage: langCodeSchema.default("zh-CN"),
  sourceLanguage: langCodeSchema.default("auto"),
  translationMode: z.enum(["dual", "translation"]).default("dual"),
  theme: z.string().default("underline"),
  font: z.string().optional(),
  service: z.string().default("google"),
  services: z.record(z.string(), serviceConfigSchema).default(DEFAULT_SERVICES),
  shortcuts: z.record(z.string(), z.string()).default({
    "toggle-translate": "Alt+A",
    "toggle-whole-page": "Alt+W",
    "translate-input": "Alt+I",
  }),
  alwaysTranslateSites: z.array(z.string()).default([]),
  neverTranslateSites: z.array(z.string()).default([]),
  alwaysTranslateLangs: z.array(langCodeSchema).default([]),
  neverTranslateLangs: z.array(langCodeSchema).default([]),
  glossaries: z.array(glossarySchema).default([]),
  userRules: z.array(ruleSchema).default([]),
  input: z
    .object({
      enabled: z.boolean().default(true),
      trigger: z.enum(["//", "space3"]).default("//"),
      targetLanguage: langCodeSchema.optional(),
    })
    .default({ enabled: true, trigger: "//" }),
  hover: z
    .object({
      enabled: z.boolean().default(false),
      holdKey: z.enum(["Alt", "Ctrl", "Shift"]).default("Alt"),
    })
    .default({ enabled: false, holdKey: "Alt" }),
  selection: z
    .object({ enabled: z.boolean().default(true) })
    .default({ enabled: true }),
  floatBall: z
    .object({
      enabled: z.boolean().default(true),
      position: z.enum(["left", "right"]).default("right"),
    })
    .default({ enabled: true, position: "right" }),
  subtitle: z
    .object({ youtube: z.boolean().default(true) })
    .default({ youtube: true }),
  cache: z
    .object({
      enabled: z.boolean().default(true),
      maxAgeDays: z.number().int().positive().default(30),
    })
    .default({ enabled: true, maxAgeDays: 30 }),
});

/** Defaults used when no configuration has been stored. */
export const DEFAULT_CONFIG: Config = configSchema.parse({});

/** A synchronous migration from one persisted version to the next. */
export type ConfigMigration = (
  config: Record<string, unknown>,
) => Record<string, unknown>;

const migrationHooks = new Map<number, ConfigMigration>();

/** Register a migration that upgrades `fromVersion` to `fromVersion + 1`. */
export function registerConfigMigration(
  fromVersion: number,
  migrate: ConfigMigration,
): void {
  migrationHooks.set(fromVersion, migrate);
}

registerConfigMigration(0, (config) => ({ ...config, version: 1 }));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Upgrade unknown stored data and validate it as the current configuration. */
export function migrateConfig(value: unknown): Config {
  let current: Record<string, unknown> = isRecord(value) ? { ...value } : {};
  let version =
    typeof current.version === "number" && Number.isInteger(current.version)
      ? current.version
      : 0;

  while (version < CONFIG_VERSION) {
    const migrate = migrationHooks.get(version);
    current = migrate ? migrate(current) : { ...current, version: version + 1 };
    version += 1;
    current.version = version;
  }

  return configSchema.parse(current);
}

/** Read, migrate, default, and validate configuration from local storage. */
export async function loadConfig(): Promise<Config> {
  const stored = await browser.storage.local.get(CONFIG_STORAGE_KEY);
  return migrateConfig(stored[CONFIG_STORAGE_KEY]);
}

/** Merge and persist a validated top-level configuration patch. */
export async function saveConfig(patch: ConfigPatch): Promise<Config> {
  const current = await loadConfig();
  const next = configSchema.parse({
    ...current,
    ...patch,
    version: CONFIG_VERSION,
  });
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: next });
  return next;
}

/** Subscribe to validated configuration changes; returns an unsubscribe function. */
export function onConfigChange(
  callback: (config: Config, previousConfig?: Config) => void,
): () => void {
  const listener = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ): void => {
    const change = changes[CONFIG_STORAGE_KEY];
    if (areaName !== "local" || !change) return;

    try {
      const next = migrateConfig(change.newValue);
      const previous = change.oldValue
        ? migrateConfig(change.oldValue)
        : undefined;
      callback(next, previous);
    } catch (error) {
      console.error("[imt] Ignoring invalid config change", error);
    }
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
