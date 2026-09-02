# Contract requests

<!-- BEGIN phase3:I translation-services -->

## Phase 3 I: translation-service integration

The adapters are complete under `src/background/services/`. The frozen contracts need the following merge-time edits.

### `src/shared/types.ts`

Add service kinds (provider presets continue to use `openai-compatible`):

```ts
export type ServiceKind =
  | "openai-compatible"
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
```

Add the phase-3 settings to `ServiceConfig`:

```ts
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
```

Keep `prompt?: string` for migration compatibility; treat it as the old name for `promptSystem`.

Add prompt variants and streaming to the request/service contract:

```ts
export type TranslationPromptVariant = "default" | "subtitle" | "selection";

export interface TranslateRequest {
  // existing fields...
  variant?: TranslationPromptVariant;
}

export interface TranslationStreamOptions {
  onPartial?(text: string): void | Promise<void>;
}

export interface TranslationService {
  // existing fields...
  supportsPair?(from: LangCode, to: LangCode): boolean;
  translate(
    request: TranslateRequest,
    signal: AbortSignal,
    options?: TranslationStreamOptions,
  ): Promise<TranslateResult>;
}
```

### `src/shared/config.ts`

Extend the `kind` enum with the values above and add these exact schema fields:

```ts
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
```

Append these entries to `DEFAULT_SERVICES`:

```ts
gemini: { kind: "gemini", enabled: false },
bing: { kind: "bing", enabled: false },
"azure-translator": { kind: "azure-translator", enabled: false },
deepl: { kind: "deepl", enabled: false },
"deepl-pro": { kind: "deepl-pro", enabled: false },
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
```

Increment `CONFIG_VERSION` and add a migration that preserves existing services while merging missing entries from the expanded defaults.

### Background entry point

In `src/background/index.ts`, extend the existing services import and initialize once before listeners are registered:

```ts
import {
  createService,
  initTranslationServices,
  listServices,
} from "./services";

initTranslationServices();
```

No `src/manifest.ts` change is needed. Its existing `<all_urls>` host permission covers the provider endpoints and local Ollama URL.

### Scheduler hooks (`src/background/scheduler.ts`)

Add a partial-output callback:

```ts
export interface TranslateParagraphsRequest {
  // existing fields...
  onPartial?(serviceId: string, text: string): void | Promise<void>;
}
```

Include `"onPartial"` in the request fields passed to `executeWithRetry`, then pass it into the adapter call:

```ts
service.translate(serviceRequest, signal, {
  onPartial: request.onPartial
    ? (text) => request.onPartial?.(service.id, text)
    : undefined,
});
```

Before cache lookup, select only a service that supports the requested pair:

```ts
const supports = (
  service: TranslationService | undefined,
): service is TranslationService =>
  Boolean(
    service &&
    (service.supportsPair?.(request.from, request.to) ??
      service.supportsLangs?.(request.from, request.to) ??
      true),
  );

let { primary, fallback } = await this.resolveServices(request.serviceId);
if (!supports(primary)) {
  if (!supports(fallback)) {
    throw new TranslateError(
      "invalid_config",
      `No configured service supports ${request.from} to ${request.to}.`,
      { serviceId: primary.id, retryable: false },
    );
  }
  primary = fallback;
  fallback = undefined;
} else if (!supports(fallback)) {
  fallback = undefined;
}
```

### Options UI contract

Import `serviceFields`, `getModels`, and `DEFAULT_PROMPTS` from `src/background/services`. `serviceFields(serviceId, locale)` returns the credential/control descriptors, including `allowCustom: true` on model controls. `getModels(serviceId, configuredModels)` merges provider defaults with user-entered model names. Labels use zh-CN by default and fall back to English through `src/background/services/i18n.ts`.

<!-- END phase3:I translation-services -->
