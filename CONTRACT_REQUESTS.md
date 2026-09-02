# Contract requests

<!-- BEGIN PHASE3-K INTEGRATION CONTRACT -->

## Phase 3 K: side panel, AI writing, selection/input upgrades, expanded options

K owns the implementation under `src/ui/**`, the two upgraded content feature files,
`src/content/features/ai-writing/**`, and the temporary prefixed shared files
`src/shared/k-types.ts` and `src/shared/k-assistant.ts`. The following frozen-file
edits are required for production wiring.

### 1. Manifest: `src/manifest.ts`

Add the Side Panel permission, page, and commands. Keep the existing entries.

```ts
permissions: [
  "storage",
  "activeTab",
  "contextMenus",
  "scripting",
  "tabs",
  "sidePanel",
],
side_panel: {
  default_path: "src/ui/sidepanel/index.html",
},
commands: {
  // existing commands...
  "toggle-side-panel": {
    suggested_key: { default: "Alt+S" },
    description: "Open the translation side panel",
  },
  "open-ai-writing": {
    suggested_key: { default: "Alt+G" },
    description: "Open AI writing",
  },
},
```

The popup opens `src/pdf/index.html` and `src/subtitle-file/index.html`; those paths
must remain the final entry paths supplied by workstreams G and H.

### 2. Config type: `src/shared/types.ts`

Add the following fields to `Config` (the definitions match
`src/shared/k-types.ts`). Preserve the existing fields shown inside `input`,
`selection`, and `subtitle`.

```ts
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
selection: {
  enabled: boolean;
  dictionary: boolean;
  autoRead: boolean;
  triggerMode: "icon-hover" | "icon-click" | "direct";
  enabledPatterns: string[];
  voiceByLanguage: Record<string, string>;
};
subtitle: {
  youtube: boolean;
  style: {
    mode: "dual" | "translation" | "source";
    fontSize: number;
    color: string;
    background: string;
    position: "top" | "bottom";
  };
};
pdf: {
  enabled: boolean;
  autoOpenOnline: boolean;
  translationMode: TranslationMode;
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
translationModeLanguagePattern: {
  dualMatches: string[];
  translationMatches: string[];
};
translationModeUrlPattern: {
  dualMatches: string[];
  translationMatches: string[];
};
translationThemePatterns: Record<string, string[]>;
globalCss: string;
```

### 3. Config schema and migration: `src/shared/config.ts`

Increment `CONFIG_VERSION` to `2`, import
`DEFAULT_AI_WRITING_PROMPTS` and `DEFAULT_INPUT_LANGUAGE_ALIASES` from
`./k-types`, and extend `configSchema` with this exact zod surface:

```ts
uiLanguage: z.enum(["auto", "zh-CN", "zh-TW", "ja", "en"]).default("auto"),
input: z.object({
  enabled: z.boolean().default(true),
  trigger: z.enum(["//", "space3"]).default("//"),
  targetLanguage: langCodeSchema.optional(),
  triggerMode: z.enum(["prefix", "trailing", "both"]).default("both"),
  startingTriggerKey: z.string().min(1).default("/"),
  trailingTriggerKey: z.string().min(1).default(" "),
  trailingTriggerCount: z.number().int().positive().default(3),
  trailingTriggerTimeoutMs: z.number().int().positive().default(1500),
  languageAliases: z.record(z.string(), z.array(z.string()))
    .default(DEFAULT_INPUT_LANGUAGE_ALIASES),
  showTargetBar: z.boolean().default(true),
  autoTargetLanguage: z.boolean().default(false),
}).default({ enabled: true, trigger: "//" }),
selection: z.object({
  enabled: z.boolean().default(true),
  dictionary: z.boolean().default(true),
  autoRead: z.boolean().default(false),
  triggerMode: z.enum(["icon-hover", "icon-click", "direct"])
    .default("icon-click"),
  enabledPatterns: z.array(z.string()).default(["<all_urls>"]),
  voiceByLanguage: z.record(z.string(), z.string()).default({}),
}).default({ enabled: true }),
subtitle: z.object({
  youtube: z.boolean().default(true),
  style: z.object({
    mode: z.enum(["dual", "translation", "source"]).default("dual"),
    fontSize: z.number().int().positive().default(20),
    color: z.string().default("#ffffff"),
    background: z.string().default("rgba(0, 0, 0, 0.72)"),
    position: z.enum(["top", "bottom"]).default("bottom"),
  }).default({}),
}).default({ youtube: true }),
pdf: z.object({
  enabled: z.boolean().default(true),
  autoOpenOnline: z.boolean().default(false),
  translationMode: z.enum(["dual", "translation"]).default("dual"),
}).default({}),
sidePanel: z.object({
  enabled: z.boolean().default(true),
  service: z.string().optional(),
  targetLanguage: langCodeSchema.optional(),
  historyLimit: z.number().int().positive().default(50),
}).default({}),
aiWriting: z.object({
  enabled: z.boolean().default(true),
  service: z.string().optional(),
  targetLanguage: langCodeSchema.optional(),
  prompts: z.object({
    summarize: z.string().default(DEFAULT_AI_WRITING_PROMPTS.summarize),
    polish: z.string().default(DEFAULT_AI_WRITING_PROMPTS.polish),
    translate: z.string().default(DEFAULT_AI_WRITING_PROMPTS.translate),
    suggestions: z.string().default(DEFAULT_AI_WRITING_PROMPTS.suggestions),
  }).default({}),
}).default({}),
translationModeLanguagePattern: z.object({
  dualMatches: z.array(z.string()).default([]),
  translationMatches: z.array(z.string()).default([]),
}).default({}),
translationModeUrlPattern: z.object({
  dualMatches: z.array(z.string()).default([]),
  translationMatches: z.array(z.string()).default([]),
}).default({}),
translationThemePatterns: z.record(z.string(), z.array(z.string())).default({}),
globalCss: z.string().default(""),
```

Register `registerConfigMigration(1, config => ({ ...config, version: 2 }))`.
The zod defaults fill every new field. After this lands,
`src/ui/shared/k-config.ts` may be simplified to delegate to `loadConfig`,
`saveConfig`, and `onConfigChange`; its current direct-storage implementation is
intentional so phase-3 settings are not stripped by the phase-1 schema.

### 4. Assistant and page messages: `src/shared/messages.ts`

Import `AssistantRequest` from `./k-assistant` and add these envelopes:

```ts
export interface AssistantRequestMessage {
  type: "assistantRequest";
  request: AssistantRequest;
}
export interface AssistantResponse {
  text: string;
}
export interface GetAssistantCapabilitiesMessage {
  type: "getAssistantCapabilities";
  serviceId: string;
}
export interface AssistantCapabilities {
  streaming: boolean;
}
export interface OpenSidePanelMessage {
  type: "openSidePanel";
  tabId: number;
}
export interface OpenAiWritingMessage {
  type: "openAiWriting";
}
export interface GetPageStateMessage {
  type: "getPageState";
}
export interface GetSelectionTextMessage {
  type: "getSelectionText";
}
export interface SidePanelSelectionMessage {
  type: "sidePanelSelection";
  text: string;
}
```

Add the first three request messages to `BackgroundRequest` and map their
responses in `BackgroundResponse`. Add `OpenAiWritingMessage`,
`GetPageStateMessage`, and `GetSelectionTextMessage` to `TabMessage`. Add all
envelopes to `Msg`. The assistant streaming port name is already exported as
`ASSISTANT_PORT_NAME` from `src/shared/k-assistant.ts`; its response shape is:

```ts
{
  type: "assistantPartial";
  requestId: string;
  text?: string; // cumulative text, not a delta
  done: boolean;
  error?: string;
}
```

### 5. Service capability and descriptor: `src/background/services/**`

Workstream I's service descriptor should be structurally compatible with
`src/ui/shared/service-fields.ts`:

```ts
export interface ServiceFieldDescriptor {
  key:
    | "apiKey"
    | "baseUrl"
    | "model"
    | "prompt"
    | "apiPath"
    | "temperature"
    | "maxTokens"
    | "timeoutMs"
    | "method"
    | "maxBatchSize"
    | "maxBatchChars"
    | "rateLimit.rps"
    | "rateLimit.concurrency"
    | "fallbackService"
    | "headers"
    | "requestBodyTemplate"
    | "responseJsonPath";
  label: string;
  control: "text" | "password" | "url" | "number" | "textarea" | "select";
  min?: number;
  step?: number;
  placeholder?: string;
}
export function serviceFields(
  serviceId: string,
): readonly ServiceFieldDescriptor[];
```

Once I's implementation is merged, either re-export it from the local UI file or
change the Options import to I's canonical module. Do not keep two divergent
descriptor tables.

For AI-only actions, extend the adapter contract without changing the existing
`translate` method:

```ts
completePrompt?(
  request: AssistantRequest,
  signal: AbortSignal,
): Promise<string>;
onPartial?(
  request: AssistantRequest,
  emitCumulativeText: (text: string) => void,
  signal: AbortSignal,
): Promise<string>;
```

`getAssistantCapabilities` must return
`{ streaming: typeof service.onPartial === "function" }`. `assistantRequest`
uses `service.translate` for `kind === "translate"`; `chat`, `writing`, and
`dictionary` require `completePrompt`. The assistant port calls `onPartial` when
present and otherwise calls `completePrompt` once. Never make network requests
from the UI or content script.

### 6. Background entry: `src/background/index.ts`

Add handlers for the three assistant messages and `openSidePanel`. Register an
`ASSISTANT_PORT_NAME` `runtime.onConnect` listener using the cumulative partial
shape above. Also wire:

```ts
if (command === "toggle-side-panel") {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await chrome.sidePanel.open({ tabId: tab.id });
}
if (command === "open-ai-writing") {
  await sendToActiveTab(() => ({ type: "openAiWriting" }));
}
```

Add context-menu items for `AI 写作` and `解释这段`. The first sends
`openAiWriting` to the clicked tab. The second opens the side panel and broadcasts
`{ type: "sidePanelSelection", text: info.selectionText.trim() }` so the panel's
existing listener receives the selected text. Call
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` during
installation. The `openSidePanel` message handler calls
`chrome.sidePanel.open({ tabId: request.tabId })` and returns `{ opened: true }`.

### 7. Content entry: `src/content/index.ts`

Import and register AI writing beside the existing feature initializers:

```ts
import { init as initAiWriting } from "./features/ai-writing";

featureDisposers = [
  // existing feature init calls...
  initAiWriting(context),
];
```

Extend the existing runtime listener with response branches:

```ts
if (incoming.type === "getPageState") {
  return Promise.resolve({
    title: document.title,
    url: location.href,
    translated: controller?.isTranslated() ?? false,
    detectedLanguage: detectLang(document.body?.innerText.slice(0, 2000) ?? ""),
  });
}
if (incoming.type === "getSelectionText") {
  const active = document.activeElement;
  const text =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0)
      : (window.getSelection()?.toString() ?? "");
  return Promise.resolve({ text: text.trim() });
}
```

When injecting renderer styles, append `config.globalCss` after rule CSS so the
user's global CSS has final precedence. Apply
`translationModeLanguagePattern`, `translationModeUrlPattern`, and
`translationThemePatterns` during the same rule-resolution step used for the
current page.

### 8. UI locale folders

`src/ui/shared/i18n.ts` now contains complete typed tables and locale resolution
for zh-CN, en, zh-TW, and ja. Add `_locales/zh_TW/messages.json` and
`_locales/ja/messages.json` by translating every manifest-level key present in
`_locales/en/messages.json`; K could not edit `_locales/**` under the workstream
directory rule. Runtime UI language must call `setUiLocaleOverride(config.uiLanguage)`.

<!-- END PHASE3-K INTEGRATION CONTRACT -->
