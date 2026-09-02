import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { builtinRules } from "../../background/rules/builtin-rules";
import { ruleSchema } from "../../shared/config";
import { LANGUAGE_CODES } from "../../shared/lang";
import type {
  Config,
  ConfigPatch,
  LangCode,
  ServiceConfig,
  TranslationMode,
} from "../../shared/types";
import { Button, Card, Field, Select, Toggle } from "../shared/components";
import { parseConfigImport, serializeConfig } from "../shared/config-transfer";
import { languageName, serviceName, t, type I18nKey } from "../shared/i18n";
import {
  clearCache,
  getCacheCount,
  testServiceConnection,
} from "../shared/runtime";
import { useConfig } from "../shared/use-config";
import "../shared/styles.css";
import "./options.css";

type TabId =
  | "basic"
  | "services"
  | "features"
  | "rules"
  | "glossary"
  | "shortcuts"
  | "data";

type ConfigUpdater = (
  patch: ConfigPatch | ((config: Config) => ConfigPatch),
) => Promise<Config>;

const tabs: readonly { id: TabId; label: I18nKey }[] = [
  { id: "basic", label: "tab.basic" },
  { id: "services", label: "tab.services" },
  { id: "features", label: "tab.features" },
  { id: "rules", label: "tab.rules" },
  { id: "glossary", label: "tab.glossary" },
  { id: "shortcuts", label: "tab.shortcuts" },
  { id: "data", label: "tab.data" },
];

export function Options(): preact.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const { config, error, updateConfig } = useConfig();

  if (!config) {
    return (
      <main class="options-loading">
        <p class={error ? "ui-status ui-status-error" : "ui-status"}>
          {error ? t("common.saveFailed") : t("common.loading")}
        </p>
      </main>
    );
  }

  return (
    <main class="options-shell">
      <aside class="options-sidebar">
        <h1>{t("options.title")}</h1>
        <nav role="tablist" aria-label={t("options.title")}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {t(tab.label)}
            </button>
          ))}
        </nav>
      </aside>

      <div
        id={`panel-${activeTab}`}
        class="options-content"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        <header class="options-content-header">
          <h2>{t(tabs.find((tab) => tab.id === activeTab)!.label)}</h2>
          {error && (
            <p role="alert" class="ui-status ui-status-error">
              {t("common.saveFailed")}
            </p>
          )}
        </header>
        {activeTab === "basic" && (
          <BasicPanel config={config} onPatch={updateConfig} />
        )}
        {activeTab === "services" && (
          <ServicesPanel config={config} onPatch={updateConfig} />
        )}
        {activeTab === "features" && (
          <FeaturesPanel config={config} onPatch={updateConfig} />
        )}
        {activeTab === "rules" && (
          <RulesPanel config={config} onPatch={updateConfig} />
        )}
        {activeTab === "glossary" && (
          <GlossaryPanel config={config} onPatch={updateConfig} />
        )}
        {activeTab === "shortcuts" && <ShortcutsPanel config={config} />}
        {activeTab === "data" && (
          <DataPanel config={config} onPatch={updateConfig} />
        )}
      </div>
    </main>
  );
}

interface PanelProps {
  config: Config;
  onPatch: ConfigUpdater;
}

function BasicPanel({ config, onPatch }: PanelProps): preact.JSX.Element {
  const languageOptions = LANGUAGE_CODES.map((code) => ({
    value: code,
    label: languageName(code),
  }));
  const targetLanguageOptions = languageOptions.filter(
    (option) => option.value !== "auto",
  );
  const themeOptions = [
    ["underline", "theme.underline"],
    ["dashed", "theme.dashed"],
    ["highlight", "theme.highlight"],
    ["paper", "theme.paper"],
    ["blockquote", "theme.blockquote"],
    ["grey", "theme.grey"],
  ] as const;

  return (
    <div class="options-stack">
      <Card title={t("basic.language")}>
        <div class="form-grid two-columns">
          <Field label={t("basic.targetLanguage")} htmlFor="target-language">
            <Select
              id="target-language"
              value={config.targetLanguage}
              options={targetLanguageOptions}
              onChange={(value) =>
                save(onPatch, { targetLanguage: value as LangCode })
              }
            />
          </Field>
          <Field label={t("basic.sourceLanguage")} htmlFor="source-language">
            <Select
              id="source-language"
              value={config.sourceLanguage}
              options={languageOptions}
              onChange={(value) =>
                save(onPatch, { sourceLanguage: value as LangCode })
              }
            />
          </Field>
        </div>
        <div class="segmented options-segmented" role="group">
          {(["dual", "translation"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={config.translationMode === mode}
              onClick={() =>
                save(onPatch, {
                  translationMode: mode as TranslationMode,
                })
              }
            >
              {t(mode === "dual" ? "mode.dual" : "mode.translation")}
            </button>
          ))}
        </div>
      </Card>

      <Card title={t("basic.theme")}>
        <div class="theme-picker">
          {themeOptions.map(([theme, label]) => (
            <button
              key={theme}
              type="button"
              class="theme-choice"
              aria-pressed={config.theme === theme}
              onClick={() => save(onPatch, { theme })}
            >
              <span class={`theme-swatch theme-${theme}`} aria-hidden="true">
                Aa
              </span>
              <span>{t(label)}</span>
            </button>
          ))}
        </div>
        <p
          class={`theme-preview theme-${config.theme}`}
          style={{ fontFamily: config.font || "inherit" }}
        >
          {t("basic.themePreview")}
        </p>
        <Field label={t("basic.font")} htmlFor="translation-font">
          <Select
            id="translation-font"
            value={config.font || ""}
            options={[
              { value: "", label: t("basic.followPageFont") },
              { value: "system-ui", label: t("basic.systemFont") },
              { value: "PingFang SC", label: t("basic.chineseFont") },
              { value: "serif", label: t("basic.serifFont") },
              { value: "monospace", label: t("basic.monospaceFont") },
            ]}
            onChange={(font) => save(onPatch, { font: font || undefined })}
          />
        </Field>
      </Card>

      <Card title={t("basic.floatBall")}>
        <div class="form-stack">
          <Toggle
            checked={config.floatBall.enabled}
            label={t("common.enabled")}
            onChange={(enabled) =>
              save(onPatch, {
                floatBall: { ...config.floatBall, enabled },
              })
            }
          />
          <Field label={t("basic.floatBallPosition")} htmlFor="float-position">
            <Select
              id="float-position"
              value={config.floatBall.position}
              disabled={!config.floatBall.enabled}
              options={[
                { value: "left", label: t("position.left") },
                { value: "right", label: t("position.right") },
              ]}
              onChange={(position) =>
                save(onPatch, {
                  floatBall: {
                    ...config.floatBall,
                    position: position as "left" | "right",
                  },
                })
              }
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

function ServicesPanel({ config, onPatch }: PanelProps): preact.JSX.Element {
  const serviceIds = Object.keys(config.services);
  return (
    <div class="options-stack">
      <p class="ui-status">{t("services.description")}</p>
      {serviceIds.map((serviceId) => (
        <ServiceCard
          key={serviceId}
          serviceId={serviceId}
          service={config.services[serviceId]!}
          serviceIds={serviceIds}
          onPatch={onPatch}
        />
      ))}
    </div>
  );
}

interface ServiceCardProps {
  serviceId: string;
  service: ServiceConfig;
  serviceIds: readonly string[];
  onPatch: ConfigUpdater;
}

function ServiceCard({
  serviceId,
  service,
  serviceIds,
  onPatch,
}: ServiceCardProps): preact.JSX.Element {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  }>();

  const updateService = (patch: Partial<ServiceConfig>): void => {
    save(onPatch, (current) => ({
      services: {
        ...current.services,
        [serviceId]: { ...current.services[serviceId]!, ...patch },
      },
    }));
  };

  const runTest = async (): Promise<void> => {
    setTesting(true);
    setTestResult(undefined);
    try {
      const result = await testServiceConnection(serviceId, service);
      setTestResult(
        result
          ? {
              ok: result.ok,
              message:
                result.message ||
                t(result.ok ? "services.testSuccess" : "services.testFailed"),
            }
          : { ok: false, message: t("services.testUnavailable") },
      );
    } catch (error) {
      setTestResult({
        ok: false,
        message:
          error instanceof Error ? error.message : t("services.testFailed"),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title={serviceName(serviceId)}
      actions={
        <Toggle
          checked={service.enabled ?? false}
          label={t("common.enabled")}
          onChange={(enabled) => updateService({ enabled })}
        />
      }
    >
      <div class="form-grid two-columns service-fields">
        <Field label={t("services.apiKey")} htmlFor={`${serviceId}-api-key`}>
          <div class="password-field">
            <input
              id={`${serviceId}-api-key`}
              type={showKey ? "text" : "password"}
              value={service.apiKey || ""}
              onInput={(event) =>
                updateService({
                  apiKey: event.currentTarget.value || undefined,
                })
              }
            />
            <button type="button" onClick={() => setShowKey((value) => !value)}>
              {t(showKey ? "common.hide" : "common.show")}
            </button>
          </div>
        </Field>
        <Field label={t("services.baseUrl")} htmlFor={`${serviceId}-url`}>
          <input
            id={`${serviceId}-url`}
            type="url"
            value={service.baseUrl || ""}
            onInput={(event) =>
              updateService({ baseUrl: event.currentTarget.value || undefined })
            }
          />
        </Field>
        <Field label={t("services.model")} htmlFor={`${serviceId}-model`}>
          <input
            id={`${serviceId}-model`}
            type="text"
            value={service.model || ""}
            onInput={(event) =>
              updateService({ model: event.currentTarget.value || undefined })
            }
          />
        </Field>
        <Field label={t("services.fallback")} htmlFor={`${serviceId}-fallback`}>
          <Select
            id={`${serviceId}-fallback`}
            value={service.fallbackService || ""}
            options={[
              { value: "", label: t("common.none") },
              ...serviceIds
                .filter((id) => id !== serviceId)
                .map((id) => ({ value: id, label: serviceName(id) })),
            ]}
            onChange={(fallbackService) =>
              updateService({ fallbackService: fallbackService || undefined })
            }
          />
        </Field>
        <Field
          label={t("services.concurrency")}
          htmlFor={`${serviceId}-concurrency`}
        >
          <input
            id={`${serviceId}-concurrency`}
            type="number"
            min="1"
            value={service.rateLimit?.concurrency ?? ""}
            onInput={(event) =>
              updateService({
                rateLimit: {
                  ...service.rateLimit,
                  concurrency: positiveInteger(event.currentTarget.value),
                },
              })
            }
          />
        </Field>
        <Field
          label={t("services.batchSize")}
          htmlFor={`${serviceId}-batch-size`}
        >
          <input
            id={`${serviceId}-batch-size`}
            type="number"
            min="1"
            value={service.maxBatchSize ?? ""}
            onInput={(event) =>
              updateService({
                maxBatchSize: positiveInteger(event.currentTarget.value),
              })
            }
          />
        </Field>
      </div>
      <Field label={t("services.prompt")} htmlFor={`${serviceId}-prompt`}>
        <textarea
          id={`${serviceId}-prompt`}
          value={service.prompt || ""}
          onInput={(event) =>
            updateService({ prompt: event.currentTarget.value || undefined })
          }
        />
      </Field>
      <div class="service-test-row">
        <Button disabled={testing} onClick={() => void runTest()}>
          {t(testing ? "services.testing" : "services.test")}
        </Button>
        {testResult && (
          <p
            role="status"
            class={`ui-status ${
              testResult.ok ? "ui-status-success" : "ui-status-error"
            }`}
          >
            {testResult.message}
          </p>
        )}
      </div>
    </Card>
  );
}

function FeaturesPanel({ config, onPatch }: PanelProps): preact.JSX.Element {
  return (
    <div class="options-stack">
      <Card title={t("features.input")}>
        <div class="form-stack">
          <Toggle
            checked={config.input.enabled}
            label={t("common.enabled")}
            onChange={(enabled) =>
              save(onPatch, { input: { ...config.input, enabled } })
            }
          />
          <Field label={t("features.inputTrigger")} htmlFor="input-trigger">
            <Select
              id="input-trigger"
              value={config.input.trigger}
              disabled={!config.input.enabled}
              options={[
                { value: "//", label: t("features.triggerSlash") },
                { value: "space3", label: t("features.triggerSpace") },
              ]}
              onChange={(trigger) =>
                save(onPatch, {
                  input: {
                    ...config.input,
                    trigger: trigger as "//" | "space3",
                  },
                })
              }
            />
          </Field>
        </div>
      </Card>
      <Card title={t("features.selection")}>
        <Toggle
          checked={config.selection.enabled}
          label={t("common.enabled")}
          onChange={(enabled) => save(onPatch, { selection: { enabled } })}
        />
      </Card>
      <Card title={t("features.hover")}>
        <div class="form-stack">
          <Toggle
            checked={config.hover.enabled}
            label={t("common.enabled")}
            onChange={(enabled) =>
              save(onPatch, { hover: { ...config.hover, enabled } })
            }
          />
          <Field label={t("features.holdKey")} htmlFor="hover-key">
            <Select
              id="hover-key"
              value={config.hover.holdKey}
              disabled={!config.hover.enabled}
              options={["Alt", "Ctrl", "Shift"].map((key) => ({
                value: key,
                label: key,
              }))}
              onChange={(holdKey) =>
                save(onPatch, {
                  hover: {
                    ...config.hover,
                    holdKey: holdKey as "Alt" | "Ctrl" | "Shift",
                  },
                })
              }
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

function RulesPanel({ config, onPatch }: PanelProps): preact.JSX.Element {
  const [ruleText, setRuleText] = useState(() =>
    JSON.stringify(config.userRules, null, 2),
  );
  const [validation, setValidation] = useState<{
    ok: boolean;
    message: string;
  }>();

  const validateRules = async (): Promise<void> => {
    let value: unknown;
    try {
      value = JSON.parse(ruleText);
    } catch {
      setValidation({ ok: false, message: t("rules.invalidJson") });
      return;
    }

    const result = ruleSchema.array().safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const detail = issue
        ? `${issue.path.join(".") || "[]"}: ${issue.message}`
        : "";
      setValidation({
        ok: false,
        message: t("rules.invalidSchema", { detail }),
      });
      return;
    }

    try {
      await onPatch({ userRules: result.data });
      setRuleText(JSON.stringify(result.data, null, 2));
      setValidation({ ok: true, message: t("rules.valid") });
    } catch {
      setValidation({ ok: false, message: t("common.saveFailed") });
    }
  };

  return (
    <div class="options-stack rules-layout">
      <Card title={t("rules.builtin")}>
        {builtinRules.length ? (
          <ul class="rule-list">
            {builtinRules.map((rule, index) => (
              <li key={rule.id || `${rule.matches.join("|")}-${index}`}>
                <strong>{rule.id || rule.matches[0]}</strong>
                <span>
                  {t("rules.matches", { matches: rule.matches.join(", ") })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="ui-status">{t("rules.noBuiltin")}</p>
        )}
      </Card>
      <Card title={t("rules.user")}>
        <textarea
          class="rules-editor"
          aria-label={t("rules.user")}
          spellcheck={false}
          value={ruleText}
          onInput={(event) => setRuleText(event.currentTarget.value)}
        />
        <div class="rules-actions">
          <Button variant="primary" onClick={() => void validateRules()}>
            {t("common.validate")}
          </Button>
          {validation && (
            <p
              role={validation.ok ? "status" : "alert"}
              class={`ui-status ${
                validation.ok ? "ui-status-success" : "ui-status-error"
              }`}
            >
              {validation.message}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function GlossaryPanel({ config, onPatch }: PanelProps): preact.JSX.Element {
  const updateEntry = (index: number, key: "k" | "v", value: string): void => {
    const glossaries = config.glossaries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [key]: value } : entry,
    );
    save(onPatch, { glossaries });
  };

  return (
    <Card>
      <div class="glossary-header" aria-hidden="true">
        <span>{t("glossary.source")}</span>
        <span>{t("glossary.target")}</span>
        <span />
      </div>
      {config.glossaries.length ? (
        <div class="glossary-list">
          {config.glossaries.map((entry, index) => (
            <div class="glossary-row" key={index}>
              <input
                type="text"
                aria-label={`${t("glossary.source")} ${index + 1}`}
                value={entry.k}
                onInput={(event) =>
                  updateEntry(index, "k", event.currentTarget.value)
                }
              />
              <input
                type="text"
                aria-label={`${t("glossary.target")} ${index + 1}`}
                value={entry.v}
                onInput={(event) =>
                  updateEntry(index, "v", event.currentTarget.value)
                }
              />
              <Button
                variant="quiet"
                aria-label={`${t("common.remove")} ${index + 1}`}
                onClick={() =>
                  save(onPatch, {
                    glossaries: config.glossaries.filter(
                      (_, entryIndex) => entryIndex !== index,
                    ),
                  })
                }
              >
                {t("common.remove")}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p class="ui-status glossary-empty">{t("glossary.empty")}</p>
      )}
      <Button
        onClick={() =>
          save(onPatch, {
            glossaries: [...config.glossaries, { k: "", v: "" }],
          })
        }
      >
        {t("glossary.add")}
      </Button>
    </Card>
  );
}

function ShortcutsPanel({ config }: { config: Config }): preact.JSX.Element {
  const shortcutLabels: Record<string, I18nKey> = {
    "toggle-translate": "shortcuts.toggle",
    "toggle-whole-page": "shortcuts.wholePage",
    "translate-input": "shortcuts.input",
  };
  return (
    <Card>
      <p class="ui-status shortcuts-description">
        {t("shortcuts.description")}
      </p>
      <dl class="shortcut-list">
        {Object.entries(config.shortcuts).map(([command, shortcut]) => (
          <div key={command}>
            <dt>
              {shortcutLabels[command] ? t(shortcutLabels[command]) : command}
            </dt>
            <dd>{shortcut || t("shortcuts.unknown")}</dd>
          </div>
        ))}
      </dl>
      <a href="chrome://extensions/shortcuts" target="_blank">
        {t("shortcuts.manage")}
      </a>
    </Card>
  );
}

function DataPanel({ config, onPatch }: PanelProps): preact.JSX.Element {
  const [cacheCount, setCacheCount] = useState<number>();
  const [cacheStatus, setCacheStatus] = useState<string>();
  const [redactApiKeys, setRedactApiKeys] = useState(true);
  const [importStatus, setImportStatus] = useState<{
    ok: boolean;
    message: string;
  }>();

  useEffect(() => {
    void getCacheCount()
      .then(setCacheCount)
      .catch(() => setCacheCount(undefined));
  }, []);

  const clear = async (): Promise<void> => {
    try {
      const cleared = await clearCache();
      if (cleared === undefined) {
        setCacheStatus(t("data.cacheClearFailed"));
        return;
      }
      setCacheCount(0);
      setCacheStatus(t("data.cacheCleared", { count: cleared }));
    } catch {
      setCacheStatus(t("data.cacheClearFailed"));
    }
  };

  const download = (): void => {
    const blob = new Blob([serializeConfig(config, redactApiKeys)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bilingual-translator-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File): Promise<void> => {
    const result = parseConfigImport(await file.text());
    if (!result.ok) {
      setImportStatus({
        ok: false,
        message: t(
          result.reason === "invalid-json"
            ? "data.importInvalidJson"
            : "data.importInvalidSchema",
        ),
      });
      return;
    }
    if (!window.confirm(t("data.importConfirm"))) return;

    const { version: _version, ...patch } = result.config;
    void _version;
    try {
      await onPatch(patch);
      setImportStatus({ ok: true, message: t("data.imported") });
    } catch {
      setImportStatus({ ok: false, message: t("common.saveFailed") });
    }
  };

  return (
    <div class="options-stack">
      <Card title={t("data.cache")}>
        <div class="data-row">
          <div>
            <p>
              {cacheCount === undefined
                ? t("data.cacheUnavailable")
                : t("data.cacheCount", { count: cacheCount })}
            </p>
            {cacheStatus && <p class="ui-status">{cacheStatus}</p>}
          </div>
          <Button variant="danger" onClick={() => void clear()}>
            {t("data.clearCache")}
          </Button>
        </div>
      </Card>
      <Card title={t("data.export")}>
        <label class="checkbox-row">
          <input
            type="checkbox"
            checked={redactApiKeys}
            onChange={(event) => setRedactApiKeys(event.currentTarget.checked)}
          />
          <span>{t("data.redactApiKeys")}</span>
        </label>
        <Button onClick={download}>{t("data.exportButton")}</Button>
      </Card>
      <Card title={t("data.import")}>
        <label class="file-picker">
          <span class="ui-button ui-button-secondary">
            {t("data.importButton")}
          </span>
          <input
            type="file"
            accept="application/json,.json"
            aria-label={t("data.importButton")}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {importStatus && (
          <p
            role={importStatus.ok ? "status" : "alert"}
            class={`ui-status ${
              importStatus.ok ? "ui-status-success" : "ui-status-error"
            }`}
          >
            {importStatus.message}
          </p>
        )}
        <p class="ui-status">{t("data.about")}</p>
      </Card>
    </div>
  );
}

function positiveInteger(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function save(
  update: ConfigUpdater,
  patch: ConfigPatch | ((config: Config) => ConfigPatch),
): void {
  void update(patch).catch(console.error);
}

const root = document.getElementById("app");
if (root) render(<Options />, root);
