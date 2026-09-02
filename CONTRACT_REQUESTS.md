# Contract requests

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

`src/pdf/index.tsx` imports `pdf.worker.min.mjs?url`; Vite emits the worker as a local hashed asset. It is fetched by the same-origin extension reader and must not be replaced with a CDN URL. The HTML resource entry above makes the reader navigable from intercepted web tabs; no separate wildcard worker resource is needed.

<!-- phase3:G PDF translation END -->
