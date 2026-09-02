# Contract requests

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
        subtitleFile: fileURLToPath(
          new URL("./src/subtitle-file/index.html", import.meta.url),
        ),
      },
    },
  },
});
```

Open it from the options/popup entry chosen by the UI integrator with:

```ts
void browser.tabs.create({
  url: browser.runtime.getURL("src/subtitle-file/index.html"),
});
```

The page uses the existing translation port. It must open in an extension tab so `Port.sender.tab.id` remains available to the current background port handler.

<!-- END phase3:H subtitle integration -->
