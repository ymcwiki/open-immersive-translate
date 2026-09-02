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

```ts
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        pdf: fileURLToPath(new URL("./src/pdf/index.html", import.meta.url)),
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
