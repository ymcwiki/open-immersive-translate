# Phase 0 contracts

`src/shared/*` is the frozen cross-workstream boundary for phase 1.

## Shared types

- `LangCode`: supported normalized source and target language codes.
- `JsonValue`: values safe for cross-context extension messages.
- `GlossaryEntry`: one source-to-target glossary replacement.
- `TranslationLanguagePair`: a directional pair that disables same-language skipping.
- `Paragraph`: one DOM-backed, independently translatable unit.
- `PlaceholderStyle`: service-specific rich-text placeholder delimiters.
- `TranslateParagraph`: serializable paragraph id and text sent to background.
- `TranslationContext`: optional page title and summary prompt context.
- `TranslateRequest`: ordered batch accepted by service adapters.
- `TranslationUsage`: optional service token accounting.
- `TranslateResult`: ordered successful batch output.
- `TranslateErrorCode` / `TranslateError`: serializable failure category and details.
- `RateLimit`: requests-per-second and concurrency limits.
- `TranslationService`: common adapter interface.
- `ServiceKind` / `ServiceConfig`: persisted adapter family and settings.
- `TranslationMode`: dual-source or translation-only display mode.
- `WrapperAffix`: literal or smart translation wrapper affix.
- `Rule`: merged URL, extraction, rendering, and service behavior.
- `Config` / `ConfigPatch`: complete local settings and validated top-level updates.

## Configuration

- `CONFIG_VERSION`: current persisted format version.
- `CONFIG_STORAGE_KEY`: `chrome.storage.local` key.
- `serviceConfigSchema`, `ruleSchema`, `configSchema`: zod runtime schemas.
- `DEFAULT_CONFIG`: fully defaulted configuration.
- `ConfigMigration`: one synchronous version upgrade.
- `registerConfigMigration(version, fn)`: register the next migration step.
- `migrateConfig(value)`: upgrade and validate unknown stored data.
- `loadConfig()`: read, migrate, default, and validate local configuration.
- `saveConfig(patch)`: validate and persist a top-level patch.
- `onConfigChange(callback)`: subscribe to validated local configuration changes.

## Language

- `LANGUAGE_CODES`: supported language-code tuple.
- `LANGUAGE_DISPLAY_NAMES`: English display label by code.
- `normalizeLang(value)`: normalize aliases and BCP-47 variants; unknown values become `auto`.
- `isSameLang(a, b, pairs?)`: compare languages, treating Chinese variants as equal unless the direction is configured.
- `detectLang(text)`: phase-1 detector hook; returns `auto` in phase 0.

## Messages and ports

- `Msg`: union of every one-off and port message.
- `GetRuleMessage`, `TranslateMessage`, `TranslateResultMessage`, `CancelMessage`, `GetConfigMessage`, `SetConfigMessage`, `ConfigChangedMessage`, `ToggleTranslateMessage`, `TranslateInputMessage`: one-off protocol envelopes.
- `TranslatePortMessage`, `CancelPortMessage`: content-side requests whose tab id is supplied by `Port.sender`.
- `ParagraphTranslationResult`: one streamed paragraph success or error.
- `BackgroundRequest` / `BackgroundResponse<T>`: request union and inferred response mapping.
- `TranslateAcknowledgement` / `CancelAcknowledgement`: one-off command acknowledgements.
- `TabMessage`: messages accepted by content scripts.
- `sendToBackground(message)`: typed runtime request with inferred response.
- `sendToTab(tabId, message)`: typed one-off content-script message.
- `TRANSLATE_PORT_NAME`: stable streaming port name.
- `TranslatePortRequest` / `TranslatePortResponse`: streaming directions.
- `TypedTranslatePort`, `ContentTranslatePort`, `BackgroundTranslatePort`: typed port facades.
- `connectTranslatePort()`: open a content-side translation port.
- `onTranslatePort(handler)`: subscribe to background-side translation ports.

## Rules and services

- `generalRule`: baseline extraction and rendering defaults.
- `mergeRules(base, ...overrides)`: merge in priority order; `additional*` fields append and other defined fields replace.
- `matchRule(url, doc?)`: phase-1 URL matching hook; returns a clone of `generalRule` in phase 0.
- `builtinRules`: phase-1 built-in site rule collection.
- `BaseServiceOptions`: immutable common adapter fields.
- `BaseService`: abstract service base with limits and default language support.
- `OpenAICompatibleService`, `ClaudeService`, `GoogleService`, `DeepLXService`, `CustomHttpService`: registered phase-1 adapter stubs.
- `getService(id)` / `listServices()`: lookup and enumerate registered adapters.

## Later-module stub surfaces

- `TranslationScheduler.translate()` / `.cancel()`: scheduler entry points; `TranslateResultEmitter` receives partial output.
- `getCachedTranslation()`, `setCachedTranslation()`, `cleanupTranslationCache()`: IndexedDB cache hooks using `TranslationCacheKey` and `CachedTranslation`.
- `scanParagraphs()`, `isBlockElement()`: DOM extraction hooks.
- `encodePlaceholders()`, `decodePlaceholders()`: rich-text conversion hooks; `EncodedPlaceholders` is the encoded result.
- `injectTranslation()`: translation renderer hook.
- `observeViewport()`, `observeMutations()`, `onUrlChange()`: lazy and dynamic-page observation hooks.
- `mountFloatBall()`, `installHoverTranslation()`, `installSelectionTranslation()`, `installInputTranslation()`, `installYouTubeSubtitleTranslation()`: feature mounting hooks.
- `Popup`, `Options`: minimal phase-0 Preact page components.
- `ImtDebugState`: read-only content bootstrap state exposed as `window.__imt`.

## Module ownership

- A extract: `src/content/extract`
- B services + scheduler + cache: `src/background/services`, `src/background/scheduler.ts`, `src/background/cache.ts`
- C render + observe: `src/content/render`, `src/content/observe`
- D rules: `src/background/rules`
- E UI: `src/ui`
- F features: `src/content/features`

A workstream may create or modify only files inside its owned paths and tests for those paths. Changes to `src/shared/*` are forbidden. If a shared contract is insufficient, add a note to `CONTRACT_REQUESTS.md` instead.
