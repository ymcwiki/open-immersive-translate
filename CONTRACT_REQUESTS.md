# Contract requests

<!-- BEGIN PHASE 3 WORKSTREAM L -->

## Workstream L: rules, search enhancement, and distribution

### 1. Shared `Config` type (`src/shared/types.ts`)

Add the subscription type next to `Rule`, then add both fields to `Config`:

```ts
export interface RemoteRuleSubscription {
  url: string;
  enabled: boolean;
}

export interface Config {
  // existing fields...
  remoteRules: RemoteRuleSubscription[];
  searchEnhancement: { enabled: boolean };
}
```

### 2. Config schema and defaults (`src/shared/config.ts`)

Add this schema near the other leaf schemas:

```ts
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
```

Add these fields to `configSchema`:

```ts
remoteRules: z.array(remoteRuleSubscriptionSchema).default([]),
searchEnhancement: z
  .object({ enabled: z.boolean().default(false) })
  .default({ enabled: false }),
```

The existing defaulting behavior handles stored version-1 configs, so no migration or version bump is required.

### 3. Background rule wiring (`src/background/index.ts`)

Add the import:

```ts
import { getRemoteRules, registerRemoteRules } from "./rules/remote-rules";
```

Replace `configuredRule` with:

```ts
async function configuredRule(url: string): Promise<Rule> {
  const [config, remoteRules] = await Promise.all([
    loadConfig(),
    getRemoteRules(),
  ]);
  const displayRule: Rule = {
    matches: ["<all_urls>"],
    translationMode: config.translationMode,
    theme: config.theme,
  };
  return matchRule(url, [displayRule, ...config.userRules], { remoteRules });
}
```

Register the alarm and lifecycle listeners once at module scope:

```ts
registerRemoteRules();
```

This produces the required precedence: general rule, generated and hand-written built-ins, remote subscriptions, then display/user rules.

### 4. Content feature wiring (`src/content/index.ts`)

Add the import:

```ts
import { init as initSearchEnhancement } from "./features/search-enhancement";
```

Add one entry to `featureDisposers` inside `mountFeatures`:

```ts
initSearchEnhancement(context),
```

### 5. Manifest permission (`src/manifest.ts`)

Add `alarms` to the existing permission array:

```ts
permissions: [
  "storage",
  "alarms",
  "activeTab",
  "contextMenus",
  "scripting",
  "tabs",
],
```

No extra host permission is needed because the manifest already grants `<all_urls>`.

### 6. Options hooks owned by workstream K

In the site-rules tab, render `config.remoteRules` as rows with an HTTP(S) URL field, an enabled toggle, and remove/add controls. Save changes with `updateConfig({ remoteRules })`. Do not store fetched rule JSON in `Config`; `src/background/rules/remote-rules.ts` owns the separate `remoteRulesCache` storage record.

In the feature-settings tab, add one toggle bound to:

```ts
updateConfig({
  searchEnhancement: {
    ...config.searchEnhancement,
    enabled,
<!-- phase3:G PDF translation BEGIN -->

## Phase 3 G: PDF reader integration

The PDF implementation is contained in `src/pdf/`. Apply the following frozen-boundary edits during integration.

### 1. Add the PDF configuration contract

In `src/shared/types.ts`, add the `pdf` field to `Config`:

```ts
pdf: {
  interceptLinks: boolean;
  mode: TranslationMode;
  theme: string;
}
```

In `src/shared/config.ts`, add this field to `configSchema`:

```ts
pdf: z
  .object({
    interceptLinks: z.boolean().default(false),
    mode: z.enum(["dual", "translation"]).default("dual"),
    theme: z.string().default("underline"),
  })
  .default({
    interceptLinks: false,
    mode: "dual",
    theme: "underline",
  }),
```

The nested defaults upgrade existing stored objects during parsing, so this addition does not require a version bump or migration hook.

### 2. Register interception in the background

In `src/background/index.ts`, add the import and one-line registration:

```ts
import { init as initPdfInterception } from "../pdf/intercept";

initPdfInterception();
```

### 3. Add permissions and the reader resource to the manifest

In `src/manifest.ts`, add `"webRequest"` to `permissions`. URL-suffix interception uses the existing `tabs` permission; `webRequest` lets `src/pdf/intercept.ts` detect a top-level `Content-Type: application/pdf` response when the URL has no `.pdf` suffix.

Append this entry to `web_accessible_resources`:

```ts
{
  resources: ["src/pdf/index.html"],
  matches: ["<all_urls>"],
},
```

### 4. Build the reader HTML entry

In `vite.config.ts`, add the PDF HTML file as a Rollup input while retaining the CRX plugin:
<!-- BEGIN phase3:H subtitle integration -->

## Phase 3 H: subtitle integration

Workstream H is self-contained under `src/content/features/subtitle/`, `src/subtitle-file/`, and `src/shared/subtitle-types.ts`. Apply the following wiring changes.

### 1. Config type and schema

In `src/shared/types.ts`, import the workstream type and replace the current narrow `subtitle` property:

```ts
import type { SubtitleConfig } from "./subtitle-types";

// In Config:
subtitle: SubtitleConfig;
```

In `src/shared/config.ts`, import the defaults and replace the existing `subtitle: z.object({ youtube: ... })` field with this schema:

```ts
import { DEFAULT_SUBTITLE_CONFIG } from "./subtitle-types";

subtitle: z
  .object({
    enabled: z.boolean().default(true),
    youtube: z.boolean().default(true),
    preTranslation: z.boolean().default(true),
    fontSize: z.number().min(10).max(72).default(24),
    sourceColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),
    translationColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#080808"),
    backgroundOpacity: z.number().min(0).max(1).default(0.75),
    position: z.enum(["top", "center", "bottom"]).default("bottom"),
    mode: z
      .enum(["dual", "translation-only", "source-only"])
      .default("dual"),
    offsetX: z.number().default(0),
    offsetY: z.number().default(0),
  })
  .default(DEFAULT_SUBTITLE_CONFIG),
```

This preserves the existing `subtitle.youtube` setting. The new defaults follow the reference config: pre-translation enabled, dual mode, bottom placement, white text, `#080808` background at 75% opacity.

### 2. Typed toggle message

In `src/shared/messages.ts`, add the message below to `Msg` and `TabMessage`:

```ts
export interface ToggleVideoSubtitlePreTranslationMessage {
  type: "toggleVideoSubtitlePreTranslation";
  tabId: number;
}
```

No background response mapping is needed because this is a tab message.

### 3. Content entry point

In `src/content/index.ts`, replace the old import and mount call:

```ts
import { initSubtitles } from "./features/subtitle";

// In mountFeatures:
initSubtitles(context),
```

Remove `init as initYouTubeSubtitles` and its call. The new initializer owns its runtime toggle listener and returns one disposer.

### 4. Background shortcut binding

In `src/background/index.ts`, add this branch to `browser.commands.onCommand`:

```ts
} else if (command === "toggleVideoSubtitlePreTranslation") {
  message = (tabId) => ({
    type: "toggleVideoSubtitlePreTranslation",
    tabId,
  });
}
```

### 5. Manifest

In `src/manifest.ts`, add the command:

```ts
"toggleVideoSubtitlePreTranslation": {
  description: "Toggle video subtitle pre-translation",
},
```

Replace the old YouTube-only web-accessible resource with:

```ts
web_accessible_resources: [
  {
    resources: ["src/content/features/subtitle/main-world.ts"],
    matches: [
      "*://*.youtube.com/*",
      "*://*.youtubekids.com/*",
      "*://*.netflix.com/*",
      "*://*.primevideo.com/*",
      "*://*.amazon.com/*",
      "*://*.amazon.co.uk/*",
      "*://*.amazon.de/*",
      "*://*.amazon.co.jp/*",
      "*://*.disneyplus.com/*",
      "*://*.max.com/*",
      "*://*.hbomax.com/*",
      "*://*.hbogoasia.com/*",
      "*://*.hbogoasia.tw/*",
      "*://*.hulu.com/*",
      "*://*.coursera.org/*",
      "*://*.udemy.com/*",
      "*://*.edx.org/*",
      "*://*.khanacademy.org/*",
      "*://*.ted.com/*",
      "*://*.vimeo.com/*",
      "*://*.linkedin.com/*",
      "*://*.bilibili.com/*",
      "*://*.twitter.com/*",
      "*://*.x.com/*",
      "*://*.facebook.com/*",
      "*://*.fb.watch/*",
      "*://*.dailymotion.com/*",
    ],
  },
],
```

`<all_urls>` is already present in `host_permissions`, so no new host permission is required. The MAIN-world module is exposed only to pages with a network adapter; generic `<track>` support does not inject it.

### 6. Local subtitle page build and navigation

Add the page as a Vite HTML input in `vite.config.ts` so `src/subtitle-file/index.html` is emitted:

```ts
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        pdf: fileURLToPath(new URL("./src/pdf/index.html", import.meta.url)),
        subtitleFile: fileURLToPath(
          new URL("./src/subtitle-file/index.html", import.meta.url),
        ),
      },
    },
  },
});
```

Suggested UI keys:

```ts
// zh-CN
"rules.remote": "远程规则订阅",
"rules.remoteUrl": "规则 URL",
"features.searchEnhancement": "搜索增强",

// en
"rules.remote": "Remote rule subscriptions",
"rules.remoteUrl": "Rule URL",
"features.searchEnhancement": "Search enhancement",
```

### 7. Package scripts (`package.json`)

`tsx` and `web-ext` are already present as dev dependencies. Add:

```json
"port:rules": "tsx scripts/port-rules.ts",
"build:firefox": "scripts/build-firefox.sh",
"lint:firefox": "pnpm build:firefox && scripts/lint-firefox.sh",
"build:userscript": "scripts/build-userscript.sh"
```

The build wrappers move an existing target directory to macOS Trash before building, so stale artifacts cannot survive and cleanup remains recoverable.

### 8. Generated-output ignores

Append to `.gitignore`:

```gitignore
dist-firefox/
dist-userscript/
```

Add both paths to the first ignore block in `eslint.config.js`:

```ts
ignores: [
  "dist/**",
  "dist-firefox/**",
  "dist-userscript/**",
  "node_modules/**",
  ".vite/**",
],
```

<!-- END PHASE 3 WORKSTREAM L -->
`src/pdf/index.tsx` imports `pdf.worker.min.mjs?url`; Vite emits the worker as a local hashed asset. It is fetched by the same-origin extension reader and must not be replaced with a CDN URL. The HTML resource entry above makes the reader navigable from intercepted web tabs; no separate wildcard worker resource is needed.

<!-- phase3:G PDF translation END -->
Open it from the options/popup entry chosen by the UI integrator with:

```ts
void browser.tabs.create({
  url: browser.runtime.getURL("src/subtitle-file/index.html"),
});
```

The page uses the existing translation port. It must open in an extension tab so `Port.sender.tab.id` remains available to the current background port handler.

<!-- END phase3:H subtitle integration -->
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
