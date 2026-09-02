# Contract requests

Phase-1 workstreams record proposed changes to `src/shared/*` here. Do not edit shared contracts directly.

- Workstream B: add optional `glossary`, `context`, and per-paragraph `priority` to translation requests; add aligned per-item errors to `TranslateResult`; add `apiPath`, `temperature`, `maxTokens`, `timeoutMs`, and custom HTTP `method` to `ServiceConfig`. Phase 1 works around these with scheduler/service-local extended types.
