# Contract requests

Phase-1 workstreams record proposed changes to `src/shared/*` here. Do not edit shared contracts directly.

- F: Expose `src/content/features/youtube-main.ts` in `web_accessible_resources` for `*://*.youtube.com/*` so the content script can inject it with `runtime.getURL()`.
- UI (E): add typed `testService`, `getCacheStats`, and `clearCache` background request/response messages. Options needs connection feedback plus cache count and full cache clearing; phase-1 UI uses a guarded local runtime adapter until these envelopes are frozen.
