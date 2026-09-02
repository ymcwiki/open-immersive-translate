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
