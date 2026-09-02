/** Language codes accepted by the extension and translation services. */
export type LangCode =
  | "auto"
  | "en"
  | "zh-CN"
  | "zh-TW"
  | "ja"
  | "ko"
  | "fr"
  | "de"
  | "es"
  | "ru"
  | "pt"
  | "it"
  | "ar"
  | "vi"
  | "th";

/** A value that can be transported safely through extension messaging. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

import type { AssistantRequest } from "./k-assistant";
import type { SubtitleConfig } from "./subtitle-types";

/** One glossary substitution supplied to a translation service. */
export interface GlossaryEntry {
  k: string;
  v: string;
  domain?: string;
}

/** A configured source-to-target pair that must not be treated as the same language. */
export interface TranslationLanguagePair {
  from: LangCode;
  to: LangCode;
}

/** A DOM paragraph that can be translated and rendered independently. */
export interface Paragraph {
  /** Stable identifier used for deduplication and render bookkeeping. */
  id: string;
  /** Block-level element that owns the source and eventual translation. */
  container: Element;
  /** Source text nodes and inline elements represented by this paragraph. */
  nodes: Node[];
  /** Plain text with encoded rich-text placeholders. */
  text: string;
  /** Placeholder identifier to original inline element. */
  placeholders: Map<string, Element>;
  /** Detected source language when detection has run. */
  lang?: LangCode;
}

/** Delimiters used to encode rich-text placeholders for a service. */
export interface PlaceholderStyle {
  open: string;
  close: string;
}

/** Scheduler priority for one paragraph. */
export type TranslationPriority = "normal" | "viewport" | "interactive";

/** Serializable paragraph input sent from a content script to the background. */
export interface TranslateParagraph {
  id: string;
  text: string;
  priority?: TranslationPriority;
}

/** Optional page context available to context-aware translation prompts. */
export interface TranslationContext {
  title?: string;
  summary?: string;
}

/** A batch request accepted by every translation service adapter. */
export interface TranslateRequest {
  texts: string[];
  from: LangCode;
  to: LangCode;
  glossary?: GlossaryEntry[];
  context?: TranslationContext;
  variant?: TranslationPromptVariant;
}

export type TranslationPromptVariant = "default" | "subtitle" | "selection";

export interface TranslationStreamOptions {
  onPartial?(text: string): void | Promise<void>;
}

/** Token accounting returned by services that expose usage metadata. */
export interface TranslationUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** A successful, ordered response for a translation batch. */
export interface TranslateResult {
  /** Translations in the same order as TranslateRequest.texts. */
  texts: string[];
  /** Optional errors aligned with `texts`; successful items have no error. */
  errors?: Array<TranslateError | undefined>;
  detectedLanguage?: LangCode;
  usage?: TranslationUsage;
}

/** Stable machine-readable translation failure categories. */
export type TranslateErrorCode =
  | "NOT_IMPLEMENTED"
  | "INVALID_REQUEST"
  | "INVALID_CONFIG"
  | "AUTH"
  | "RATE_LIMIT"
  | "NETWORK"
  | "TIMEOUT"
  | "ABORTED"
  | "SERVICE_UNAVAILABLE"
  | "BAD_RESPONSE"
  | "CONTENT_BLOCKED"
  | "PLACEHOLDER_MISMATCH"
  | "UNKNOWN";

/** Serializable error transported between extension contexts. */
export interface TranslateError {
  code: TranslateErrorCode;
  message: string;
  retryable: boolean;
  serviceId?: string;
  details?: JsonValue;
}

/** Rate and parallelism limits applied by the background scheduler. */
export interface RateLimit {
  rps: number;
  concurrency: number;
}

/** Contract implemented by every translation service adapter. */
export interface TranslationService {
  readonly id: string;
  readonly name: string;
  readonly maxBatchSize: number;
  readonly maxBatchChars: number;
  readonly rateLimit: RateLimit;
  readonly placeholder: PlaceholderStyle;
  supportsLangs?(from: LangCode, to: LangCode): boolean;
  supportsPair?(from: LangCode, to: LangCode): boolean;
  translate(
    request: TranslateRequest,
    signal: AbortSignal,
    options?: TranslationStreamOptions,
  ): Promise<TranslateResult>;
  completePrompt?(
    request: AssistantRequest,
    signal: AbortSignal,
  ): Promise<string>;
  onPartial?(
    request: AssistantRequest,
    emitCumulativeText: (text: string) => void,
    signal: AbortSignal,
  ): Promise<string>;
}

/** Supported adapter families for persisted service configuration. */
export type ServiceKind =
  | "openai-compatible"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "google"
  | "bing"
  | "azure-translator"
  | "deepl"
  | "deepl-pro"
  | "deeplx"
  | "volc"
  | "tencent"
  | "baidu"
  | "youdao"
  | "caiyun"
  | "aliyun"
  | "papago"
  | "yandex-free"
  | "transmart"
  | "niutrans"
  | "openl"
  | "azure-openai"
  | "custom-http"
  | "mock";

/** User-editable settings for one translation service. */
export interface ServiceConfig {
  kind: ServiceKind;
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  prompt?: string;
  apiPath?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  method?: string;
  maxBatchSize?: number;
  maxBatchChars?: number;
  rateLimit?: Partial<RateLimit>;
  placeholder?: PlaceholderStyle;
  fallbackService?: string;
  ignoreResRegexs?: string[];
  headers?: Record<string, string>;
  requestBodyTemplate?: string;
  responseJsonPath?: string;
  region?: string;
  appId?: string;
  secret?: string;
  deployment?: string;
  apiVersion?: string;
  formality?: "default" | "more" | "less" | "prefer_more" | "prefer_less";
  promptSystem?: string;
  promptUser?: string;
  models?: string[];
  stream?: boolean;
}

/** How source and translated text are displayed. */
export type TranslationMode = "dual" | "translation";

/** Smart wrappers choose a line break based on the source container. */
export type WrapperAffix = "smart" | string;

/** URL-scoped extraction, rendering, and translation behavior. */
export interface Rule {
  id?: string;
  matches: string[];
  excludeMatches?: string[];
  selectorMatches?: string[];
  selectors?: string[];
  excludeSelectors?: string[];
  additionalExcludeSelectors?: string[];
  stayOriginalSelectors?: string[];
  additionalStayOriginalSelectors?: string[];
  atomicBlockSelectors?: string[];
  additionalAtomicBlockSelectors?: string[];
  extraInlineSelectors?: string[];
  additionalExtraInlineSelectors?: string[];
  extraBlockSelectors?: string[];
  additionalExtraBlockSelectors?: string[];
  shadowRootSelectors?: string[];
  additionalShadowRootSelectors?: string[];
  mutationExcludeSelectors?: string[];
  additionalMutationExcludeSelectors?: string[];
  injectedCss?: string[];
  additionalInjectedCss?: string[];
  excludeTags?: string[];
  stayOriginalTags?: string[];
  inlineTags?: string[];
  allBlockTags?: string[];
  isTranslateTitle?: boolean;
  paragraphMinTextCount?: number;
  blockMinTextCount?: number;
  lineBreakMaxTextCount?: number;
  targetWrapperTag?: string;
  wrapperPrefix?: WrapperAffix;
  wrapperSuffix?: WrapperAffix;
  sameLangCheck?: boolean;
  enableRichTranslate?: boolean;
  glossaries?: GlossaryEntry[];
  additionalGlossaries?: GlossaryEntry[];
  translationMode?: TranslationMode;
  theme?: string;
  service?: string;
  autoTranslate?: boolean;
  mainFrameMinTextCount?: number;
  likePreSelectors?: string[];
  isTransformPreTagNewLine?: boolean;
  advanceTransformPreTagNewLine?: boolean;
}

export interface RemoteRuleSubscription {
  url: string;
  enabled: boolean;
}

export interface TranslationModePattern {
  dualMatches: string[];
  translationMatches: string[];
}

/** Complete local extension configuration. */
export interface Config {
  version: number;
  targetLanguage: LangCode;
  sourceLanguage: LangCode;
  translationMode: TranslationMode;
  theme: string;
  font?: string;
  service: string;
  services: Record<string, ServiceConfig>;
  shortcuts: Record<string, string>;
  alwaysTranslateSites: string[];
  neverTranslateSites: string[];
  alwaysTranslateLangs: LangCode[];
  neverTranslateLangs: LangCode[];
  glossaries: GlossaryEntry[];
  userRules: Rule[];
  uiLanguage: "auto" | "zh-CN" | "zh-TW" | "ja" | "en";
  input: {
    enabled: boolean;
    trigger: "//" | "space3";
    targetLanguage?: LangCode;
    triggerMode: "prefix" | "trailing" | "both";
    startingTriggerKey: string;
    trailingTriggerKey: string;
    trailingTriggerCount: number;
    trailingTriggerTimeoutMs: number;
    languageAliases: Record<string, string[]>;
    showTargetBar: boolean;
    autoTargetLanguage: boolean;
  };
  hover: {
    enabled: boolean;
    holdKey: "Alt" | "Ctrl" | "Shift";
  };
  selection: {
    enabled: boolean;
    dictionary: boolean;
    autoRead: boolean;
    triggerMode: "icon-hover" | "icon-click" | "direct";
    enabledPatterns: string[];
    voiceByLanguage: Record<string, string>;
  };
  floatBall: {
    enabled: boolean;
    position: "left" | "right";
  };
  subtitle: SubtitleConfig;
  pdf: {
    interceptLinks: boolean;
    mode: TranslationMode;
    theme: string;
  };
  sidePanel: {
    enabled: boolean;
    service?: string;
    targetLanguage?: LangCode;
    historyLimit: number;
  };
  aiWriting: {
    enabled: boolean;
    service?: string;
    targetLanguage?: LangCode;
    prompts: {
      summarize: string;
      polish: string;
      translate: string;
      suggestions: string;
    };
  };
  translationModeUrlPattern: TranslationModePattern;
  translationModeLanguagePattern: TranslationModePattern;
  translationThemePatterns: Record<string, string[]>;
  translateMainOnly: boolean;
  translateToPageEndImmediately: boolean;
  immediateTranslationConcurrency: number;
  translationMask: boolean;
  enableEditTranslation: boolean;
  hoverTranslateDirectly: boolean;
  videoSubtitlePreTranslation: boolean;
  mainFrameMinTextCount: number;
  contextWordLimit: number;
  translationFontSize?: string | number;
  translationColor?: string;
  translationLineHeight?: string | number;
  globalCustomCss: string;
  remoteRules: RemoteRuleSubscription[];
  searchEnhancement: { enabled: boolean };
  cache: {
    enabled: boolean;
    maxAgeDays: number;
  };
}

/** A validated top-level configuration update; version is migration-owned. */
export type ConfigPatch = Partial<Omit<Config, "version">>;
