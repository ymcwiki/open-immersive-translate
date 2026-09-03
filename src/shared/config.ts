import browser from "webextension-polyfill";
import { z } from "zod";

import {
  DEFAULT_AI_WRITING_PROMPTS,
  DEFAULT_INPUT_LANGUAGE_ALIASES,
} from "./k-types";
import { LANGUAGE_CODES } from "./lang";
import { DEFAULT_SUBTITLE_CONFIG, type SubtitleConfig } from "./subtitle-types";
import type { Config, ConfigPatch, Rule, ServiceConfig } from "./types";

/** Current persisted configuration format. */
export const CONFIG_VERSION = 3;

/** Storage key containing the complete configuration object. */
export const CONFIG_STORAGE_KEY = "config";

const langCodeSchema = z.enum(LANGUAGE_CODES);
const glossarySchema = z.object({
  k: z.string(),
  v: z.string(),
  domain: z.string().optional(),
});
const placeholderSchema = z.object({ open: z.string(), close: z.string() });
const rateLimitSchema = z.object({
  rps: z.number().positive().optional(),
  concurrency: z.number().int().positive().optional(),
});
export const reasoningEffortSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const translationModePatternSchema = z.object({
  dualMatches: z.array(z.string()).default([]),
  translationMatches: z.array(z.string()).default([]),
});
const remoteRuleSubscriptionSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("https://") || value.startsWith("http://"),
      "Remote rule URL must use HTTP or HTTPS",
    ),
  enabled: z.boolean().default(true),
});

/** Runtime schema for persisted service settings. */
const serviceConfigBaseSchema: z.ZodType<ServiceConfig> = z.object({
  kind: z.enum([
    "openai-compatible",
    "chatgpt",
    "claude",
    "gemini",
    "google",
    "bing",
    "azure-translator",
    "deepl",
    "deepl-pro",
    "deeplx",
    "volc",
    "tencent",
    "baidu",
    "youdao",
    "caiyun",
    "aliyun",
    "papago",
    "yandex-free",
    "transmart",
    "niutrans",
    "openl",
    "azure-openai",
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
  region: z.string().optional(),
  appId: z.string().optional(),
  secret: z.string().optional(),
  deployment: z.string().optional(),
  apiVersion: z.string().optional(),
  formality: z
    .enum(["default", "more", "less", "prefer_more", "prefer_less"])
    .optional(),
  promptSystem: z.string().optional(),
  promptUser: z.string().optional(),
  models: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
  reasoningEffortAssistant: reasoningEffortSchema.optional(),
});

export const serviceConfigSchema: z.ZodType<ServiceConfig> = z.preprocess(
  (value) =>
    isRecord(value) && value.kind === "chatgpt"
      ? {
          ...value,
          reasoningEffort: value.reasoningEffort ?? "low",
          reasoningEffortAssistant: value.reasoningEffortAssistant ?? "medium",
        }
      : value,
  serviceConfigBaseSchema,
);

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
  mainFrameMinTextCount: z.number().int().nonnegative().optional(),
  likePreSelectors: z.array(z.string()).optional(),
  isTransformPreTagNewLine: z.boolean().optional(),
  advanceTransformPreTagNewLine: z.boolean().optional(),
});

export const DEFAULT_SERVICES: Record<string, ServiceConfig> = {
  "openai-compatible": { kind: "openai-compatible", enabled: false },
  chatgpt: {
    kind: "chatgpt",
    enabled: false,
    reasoningEffort: "low",
    reasoningEffortAssistant: "medium",
  },
  claude: { kind: "claude", enabled: false },
  gemini: { kind: "gemini", enabled: false },
  google: { kind: "google", enabled: true },
  bing: { kind: "bing", enabled: false },
  "azure-translator": { kind: "azure-translator", enabled: false },
  deepl: { kind: "deepl", enabled: false },
  "deepl-pro": { kind: "deepl-pro", enabled: false },
  deeplx: { kind: "deeplx", enabled: false },
  volc: { kind: "volc", enabled: false },
  tencent: { kind: "tencent", enabled: false },
  baidu: { kind: "baidu", enabled: false },
  youdao: { kind: "youdao", enabled: false },
  caiyun: { kind: "caiyun", enabled: false },
  aliyun: { kind: "aliyun", enabled: false },
  papago: { kind: "papago", enabled: false },
  "yandex-free": { kind: "yandex-free", enabled: false },
  transmart: { kind: "transmart", enabled: false },
  niutrans: { kind: "niutrans", enabled: false },
  openl: { kind: "openl", enabled: false },
  "azure-openai": { kind: "azure-openai", enabled: false },
  "custom-http": { kind: "custom-http", enabled: false },
  mock: { kind: "mock", enabled: false },
  deepseek: { kind: "openai-compatible", enabled: false },
  qwen: { kind: "openai-compatible", enabled: false },
  kimi: { kind: "openai-compatible", enabled: false },
  zhipu: { kind: "openai-compatible", enabled: false },
  siliconcloud: { kind: "openai-compatible", enabled: false },
  groq: { kind: "openai-compatible", enabled: false },
  openrouter: { kind: "openai-compatible", enabled: false },
  grok: { kind: "openai-compatible", enabled: false },
  ollama: { kind: "openai-compatible", enabled: false },
  mistral: { kind: "openai-compatible", enabled: false },
  doubao: { kind: "openai-compatible", enabled: false },
  hunyuan: { kind: "openai-compatible", enabled: false },
  lingyiwanwu: { kind: "openai-compatible", enabled: false },
  stepfun: { kind: "openai-compatible", enabled: false },
  qianfan: { kind: "openai-compatible", enabled: false },
  minimax: { kind: "openai-compatible", enabled: false },
};

const DEFAULT_SHORTCUTS: Record<string, string> = {
  toggleTranslatePage: "Alt+A",
  toggleTranslateTheWholePage: "Alt+W",
  toggleTranslateTheMainPage: "Alt+M",
  toggleOnlyTranslation: "Alt+T",
  toggleSidePanel: "Alt+S",
  translateInputBox: "Alt+I",
  openAiWritingModal: "",
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
  shortcuts: z.record(z.string(), z.string()).default(DEFAULT_SHORTCUTS),
  alwaysTranslateSites: z.array(z.string()).default([]),
  neverTranslateSites: z.array(z.string()).default([]),
  alwaysTranslateLangs: z.array(langCodeSchema).default([]),
  neverTranslateLangs: z.array(langCodeSchema).default([]),
  glossaries: z.array(glossarySchema).default([]),
  userRules: z.array(ruleSchema).default([]),
  uiLanguage: z.enum(["auto", "zh-CN", "zh-TW", "ja", "en"]).default("auto"),
  input: z
    .object({
      enabled: z.boolean().default(true),
      trigger: z.enum(["//", "space3"]).default("//"),
      targetLanguage: langCodeSchema.optional(),
      triggerMode: z.enum(["prefix", "trailing", "both"]).default("both"),
      startingTriggerKey: z.string().min(1).default("/"),
      trailingTriggerKey: z.string().min(1).default(" "),
      trailingTriggerCount: z.number().int().positive().default(3),
      trailingTriggerTimeoutMs: z.number().int().positive().default(1500),
      languageAliases: z
        .record(z.string(), z.array(z.string()))
        .default(DEFAULT_INPUT_LANGUAGE_ALIASES),
      showTargetBar: z.boolean().default(true),
      autoTargetLanguage: z.boolean().default(false),
    })
    .default({
      enabled: true,
      trigger: "//",
      triggerMode: "both",
      startingTriggerKey: "/",
      trailingTriggerKey: " ",
      trailingTriggerCount: 3,
      trailingTriggerTimeoutMs: 1500,
      languageAliases: DEFAULT_INPUT_LANGUAGE_ALIASES,
      showTargetBar: true,
      autoTargetLanguage: false,
    }),
  hover: z
    .object({
      enabled: z.boolean().default(false),
      holdKey: z.enum(["Alt", "Ctrl", "Shift"]).default("Alt"),
    })
    .default({ enabled: false, holdKey: "Alt" }),
  selection: z
    .object({
      enabled: z.boolean().default(true),
      dictionary: z.boolean().default(true),
      autoRead: z.boolean().default(false),
      triggerMode: z
        .enum(["icon-hover", "icon-click", "direct"])
        .default("icon-click"),
      enabledPatterns: z.array(z.string()).default(["<all_urls>"]),
      voiceByLanguage: z.record(z.string(), z.string()).default({}),
    })
    .default({
      enabled: true,
      dictionary: true,
      autoRead: false,
      triggerMode: "icon-click",
      enabledPatterns: ["<all_urls>"],
      voiceByLanguage: {},
    }),
  floatBall: z
    .object({
      enabled: z.boolean().default(true),
      position: z.enum(["left", "right"]).default("right"),
    })
    .default({ enabled: true, position: "right" }),
  subtitle: z
    .object({
      enabled: z.boolean().default(true),
      youtube: z.boolean().default(true),
      preTranslation: z.boolean().default(true),
      fontSize: z.number().min(10).max(72).default(24),
      sourceColor: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default("#ffffff"),
      translationColor: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default("#ffffff"),
      backgroundColor: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default("#080808"),
      backgroundOpacity: z.number().min(0).max(1).default(0.75),
      position: z.enum(["top", "center", "bottom"]).default("bottom"),
      mode: z.enum(["dual", "translation-only", "source-only"]).default("dual"),
      offsetX: z.number().default(0),
      offsetY: z.number().default(0),
    })
    .default(DEFAULT_SUBTITLE_CONFIG),
  pdf: z
    .object({
      interceptLinks: z.boolean().default(false),
      mode: z.enum(["dual", "translation"]).default("dual"),
      theme: z.string().default("underline"),
    })
    .default({ interceptLinks: false, mode: "dual", theme: "underline" }),
  sidePanel: z
    .object({
      enabled: z.boolean().default(true),
      service: z.string().optional(),
      targetLanguage: langCodeSchema.optional(),
      historyLimit: z.number().int().positive().default(50),
    })
    .default({ enabled: true, historyLimit: 50 }),
  aiWriting: z
    .object({
      enabled: z.boolean().default(true),
      service: z.string().optional(),
      targetLanguage: langCodeSchema.optional(),
      prompts: z
        .object({
          summarize: z.string().default(DEFAULT_AI_WRITING_PROMPTS.summarize),
          polish: z.string().default(DEFAULT_AI_WRITING_PROMPTS.polish),
          translate: z.string().default(DEFAULT_AI_WRITING_PROMPTS.translate),
          suggestions: z
            .string()
            .default(DEFAULT_AI_WRITING_PROMPTS.suggestions),
        })
        .default(DEFAULT_AI_WRITING_PROMPTS),
    })
    .default({
      enabled: true,
      prompts: DEFAULT_AI_WRITING_PROMPTS,
    }),
  translationModeUrlPattern: translationModePatternSchema.default({
    dualMatches: [],
    translationMatches: [],
  }),
  translationModeLanguagePattern: translationModePatternSchema.default({
    dualMatches: [],
    translationMatches: [],
  }),
  translationThemePatterns: z
    .record(z.string(), z.array(z.string()))
    .default({}),
  translateMainOnly: z.boolean().default(true),
  translateToPageEndImmediately: z.boolean().default(false),
  immediateTranslationConcurrency: z.number().int().positive().default(4),
  translationMask: z.boolean().default(false),
  enableEditTranslation: z.boolean().default(false),
  hoverTranslateDirectly: z.boolean().default(false),
  videoSubtitlePreTranslation: z.boolean().default(false),
  mainFrameMinTextCount: z.number().int().nonnegative().default(50),
  contextWordLimit: z.number().int().positive().default(80),
  translationFontSize: z.union([z.string(), z.number()]).optional(),
  translationColor: z.string().optional(),
  translationLineHeight: z.union([z.string(), z.number()]).optional(),
  globalCustomCss: z.string().default(""),
  remoteRules: z.array(remoteRuleSubscriptionSchema).default([]),
  searchEnhancement: z
    .object({ enabled: z.boolean().default(false) })
    .default({ enabled: false }),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateSubtitle(config: Record<string, unknown>): SubtitleConfig {
  const raw = isRecord(config.subtitle) ? config.subtitle : {};
  const style = isRecord(raw.style) ? raw.style : {};
  const oldMode = style.mode;
  const oldBackground = style.background;
  return {
    ...DEFAULT_SUBTITLE_CONFIG,
    ...raw,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    youtube: typeof raw.youtube === "boolean" ? raw.youtube : true,
    preTranslation:
      typeof raw.preTranslation === "boolean"
        ? raw.preTranslation
        : typeof config.videoSubtitlePreTranslation === "boolean"
          ? config.videoSubtitlePreTranslation
          : DEFAULT_SUBTITLE_CONFIG.preTranslation,
    fontSize:
      typeof raw.fontSize === "number"
        ? raw.fontSize
        : typeof style.fontSize === "number"
          ? style.fontSize
          : DEFAULT_SUBTITLE_CONFIG.fontSize,
    sourceColor:
      typeof raw.sourceColor === "string"
        ? raw.sourceColor
        : typeof style.color === "string"
          ? style.color
          : DEFAULT_SUBTITLE_CONFIG.sourceColor,
    translationColor:
      typeof raw.translationColor === "string"
        ? raw.translationColor
        : typeof style.color === "string"
          ? style.color
          : DEFAULT_SUBTITLE_CONFIG.translationColor,
    backgroundColor:
      typeof raw.backgroundColor === "string"
        ? raw.backgroundColor
        : typeof oldBackground === "string" &&
            /^#[0-9a-f]{6}$/i.test(oldBackground)
          ? oldBackground
          : DEFAULT_SUBTITLE_CONFIG.backgroundColor,
    backgroundOpacity:
      typeof raw.backgroundOpacity === "number"
        ? raw.backgroundOpacity
        : DEFAULT_SUBTITLE_CONFIG.backgroundOpacity,
    position:
      raw.position === "top" ||
      raw.position === "center" ||
      raw.position === "bottom"
        ? raw.position
        : style.position === "top"
          ? "top"
          : "bottom",
    mode:
      raw.mode === "translation-only" ||
      raw.mode === "source-only" ||
      raw.mode === "dual"
        ? raw.mode
        : oldMode === "translation"
          ? "translation-only"
          : oldMode === "source"
            ? "source-only"
            : "dual",
    offsetX: typeof raw.offsetX === "number" ? raw.offsetX : 0,
    offsetY: typeof raw.offsetY === "number" ? raw.offsetY : 0,
  };
}

registerConfigMigration(0, (config) => ({ ...config, version: 1 }));
registerConfigMigration(1, (config) => {
  const oldPdf = isRecord(config.pdf) ? config.pdf : {};
  const oldShortcuts = isRecord(config.shortcuts) ? config.shortcuts : {};
  const subtitle = migrateSubtitle(config);
  return {
    ...config,
    version: 2,
    services: {
      ...DEFAULT_SERVICES,
      ...(isRecord(config.services) ? config.services : {}),
    },
    shortcuts: {
      ...DEFAULT_SHORTCUTS,
      ...oldShortcuts,
      toggleTranslatePage:
        typeof oldShortcuts.toggleTranslatePage === "string"
          ? oldShortcuts.toggleTranslatePage
          : typeof oldShortcuts["toggle-translate"] === "string"
            ? oldShortcuts["toggle-translate"]
            : DEFAULT_SHORTCUTS.toggleTranslatePage,
      toggleTranslateTheWholePage:
        typeof oldShortcuts.toggleTranslateTheWholePage === "string"
          ? oldShortcuts.toggleTranslateTheWholePage
          : typeof oldShortcuts["toggle-whole-page"] === "string"
            ? oldShortcuts["toggle-whole-page"]
            : DEFAULT_SHORTCUTS.toggleTranslateTheWholePage,
    },
    subtitle,
    videoSubtitlePreTranslation: subtitle.preTranslation,
    pdf: {
      interceptLinks:
        typeof oldPdf.interceptLinks === "boolean"
          ? oldPdf.interceptLinks
          : oldPdf.autoOpenOnline === true,
      mode:
        oldPdf.mode === "translation" ||
        oldPdf.translationMode === "translation"
          ? "translation"
          : "dual",
      theme:
        typeof oldPdf.theme === "string" && oldPdf.theme
          ? oldPdf.theme
          : "underline",
    },
    globalCustomCss:
      typeof config.globalCustomCss === "string" && config.globalCustomCss
        ? config.globalCustomCss
        : typeof config.globalCss === "string"
          ? config.globalCss
          : "",
  };
});

registerConfigMigration(2, (config) => {
  const services = isRecord(config.services) ? config.services : {};
  const chatgpt = isRecord(services.chatgpt) ? services.chatgpt : {};
  return {
    ...config,
    version: 3,
    services: {
      ...services,
      chatgpt: {
        kind: "chatgpt",
        enabled: false,
        ...chatgpt,
        reasoningEffort:
          chatgpt.reasoningEffort ?? DEFAULT_SERVICES.chatgpt!.reasoningEffort,
        reasoningEffortAssistant:
          chatgpt.reasoningEffortAssistant ??
          DEFAULT_SERVICES.chatgpt!.reasoningEffortAssistant,
      },
    },
  };
});

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

  const parsed = configSchema.parse(current);
  if (
    Object.keys(parsed.services).length < Object.keys(DEFAULT_SERVICES).length
  ) {
    parsed.services = { ...DEFAULT_SERVICES, ...parsed.services };
  }
  return parsed;
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
