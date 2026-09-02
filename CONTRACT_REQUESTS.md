# Contract requests

<!-- BEGIN WORKSTREAM J PHASE 3 -->

## Workstream J: advanced page controller

The implementation is in `src/content/controller/` and the temporary contract types are in `src/shared/j-types.ts`. Apply the following integration edits, then remove duplicate declarations from `j-types.ts` if desired.

### 1. Shared types and configuration

In `src/shared/types.ts`, widen the existing types and add the page-controller fields:

```ts
export interface GlossaryEntry {
  k: string;
  v: string;
  domain?: string;
}

export interface TranslationModePattern {
  dualMatches: string[];
  translationMatches: string[];
}

// Add to Rule:
mainFrameMinTextCount?: number;
likePreSelectors?: string[];
isTransformPreTagNewLine?: boolean;
advanceTransformPreTagNewLine?: boolean;

// Add to Config:
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
```

In `src/shared/config.ts`, change `glossarySchema` and extend `ruleSchema` and `configSchema`:

```ts
const glossarySchema = z.object({
  k: z.string(),
  v: z.string(),
  domain: z.string().optional(),
});

const translationModePatternSchema = z.object({
  dualMatches: z.array(z.string()).default([]),
  translationMatches: z.array(z.string()).default([]),
});

// ruleSchema additions
mainFrameMinTextCount: z.number().int().nonnegative().optional(),
likePreSelectors: z.array(z.string()).optional(),
isTransformPreTagNewLine: z.boolean().optional(),
advanceTransformPreTagNewLine: z.boolean().optional(),

// configSchema additions
translationModeUrlPattern: translationModePatternSchema.default({ dualMatches: [], translationMatches: [] }),
translationModeLanguagePattern: translationModePatternSchema.default({ dualMatches: [], translationMatches: [] }),
translationThemePatterns: z.record(z.string(), z.array(z.string())).default({}),
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
```

Also add the four Rule fields above to the strict editor schema in `src/background/rules/match.ts`. After that, move these values from `advancedPageRuleDefaults` into `generalRule` in `src/background/rules/defaults.ts`:

```ts
mainFrameMinTextCount: 50,
likePreSelectors: ["pre"],
isTransformPreTagNewLine: false,
advanceTransformPreTagNewLine: false,
```

### 2. Shared messages and background badge

Add these contracts to `src/shared/messages.ts`, include `PageTranslationStateMessage` in `Msg` and `BackgroundRequest`, and include `ControllerCommandMessage` in `Msg` and `TabMessage`:

```ts
export type PageTranslationStatus = "idle" | "translating" | "done" | "error";
export interface PageTranslationState {
  status: PageTranslationStatus;
  total: number;
  pending: number;
  translated: number;
  errors: number;
}
export interface PageTranslationStateMessage {
  type: "pageTranslationState";
  state: PageTranslationState;
}
export interface ControllerCommandMessage {
  type: "pageControllerCommand";
  command: import("./j-types").PageCommandId;
}
export interface PageTranslationStateAcknowledgement { received: true }

// Add to BackgroundResponse<T>:
T extends PageTranslationStateMessage ? PageTranslationStateAcknowledgement : ...
```

In `src/background/index.ts`, accept `sender` in the runtime listener and handle the state message before the existing switch:

```ts
function isPageTranslationStateMessage(
  message: unknown,
): message is PageTranslationStateMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "pageTranslationState"
  );
}

browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (isPageTranslationStateMessage(message)) {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      const badge = { idle: "", translating: "…", done: "✓", error: "!" }[message.state.status];
      const color = { idle: "#64748b", translating: "#2563eb", done: "#15803d", error: "#b42318" }[message.state.status];
      void browser.action.setBadgeText({ tabId, text: badge });
      void browser.action.setBadgeBackgroundColor({ tabId, color });
      void browser.action.setTitle({
        tabId,
        title: `翻译 ${message.state.translated}/${message.state.total}，失败 ${message.state.errors}`,
      });
    }
    return Promise.resolve({ received: true });
  }
  // existing handler
});
```

Replace the background command mapping with a top-frame dispatch. The controller then synchronizes eligible subframes through `postMessage`:

```ts
import { isPageCommandId } from "../content/controller/commands";

browser.commands.onCommand.addListener((command) => {
  if (!isPageCommandId(command)) return;
  void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id === undefined) return;
    return browser.tabs.sendMessage(
      tab.id,
      { type: "pageControllerCommand", command },
      { frameId: 0 },
    );
  }).catch(() => undefined);
});
```

### 3. Content entry point

Replace `src/content/index.ts` with this thin entry. This is the only content-script wiring required:

```ts
import { init } from "./controller";
void init();
```

### 4. Manifest commands

Replace the `commands` object in `src/manifest.ts` with the following block. Only four commands declare suggested keys; Chrome leaves the others user-assignable.

```ts
commands: {
  toggleTranslatePage: { suggested_key: { default: "Alt+A" }, description: "Toggle page translation" },
  toggleTranslateTheWholePage: { suggested_key: { default: "Alt+W" }, description: "Toggle whole-page translation" },
  toggleTranslateTheMainPage: { suggested_key: { default: "Alt+M" }, description: "Toggle main-area translation" },
  toggleOnlyTranslation: { suggested_key: { default: "Alt+T" }, description: "Toggle translation-only mode" },
  toggleTranslateToThePageEndImmediately: { description: "Translate immediately to page end" },
  toggleTranslationMask: { description: "Toggle translation mask" },
  toggleMouseHoverTranslateDirectly: { description: "Toggle direct hover translation" },
  toggleVideoSubtitlePreTranslation: { description: "Toggle video subtitle pre-translation" },
  translateWithGoogle: { description: "Translate with Google" },
  translateWithBing: { description: "Translate with Bing" },
  translateWithDeepL: { description: "Translate with DeepL" },
  translateWithOpenAI: { description: "Translate with OpenAI" },
  translateWithClaude: { description: "Translate with Claude" },
  translateWithGemini: { description: "Translate with Gemini" },
  translateWithCustom1: { description: "Translate with Custom 1" },
  translateWithCustom2: { description: "Translate with Custom 2" },
  translateWithCustom3: { description: "Translate with Custom 3" },
},
```

If command descriptions are localized in the manifest, add equivalent zh-CN keys to `src/_locales/zh_CN/messages.json`, English fallback keys to `src/_locales/en/messages.json`, and use `__MSG_<key>__` descriptions.

<!-- END WORKSTREAM J PHASE 3 -->
