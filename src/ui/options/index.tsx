import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { builtinRules } from "../../background/rules/builtin-rules";
import {
  DEFAULT_PROMPTS,
  getModels,
  serviceFields,
  type ServiceFieldDescriptor,
} from "../../background/services";
import { LANGUAGE_CODES } from "../../shared/lang";
import { sendToBackground } from "../../shared/messages";
import type {
  JsonValue,
  LangCode,
  Rule,
  ServiceConfig,
  TranslationMode,
} from "../../shared/types";
import type { KConfig } from "../../shared/k-types";
import { Button, Card, Field, Select, Toggle } from "../shared/components";
import { parseConfigImport, serializeConfig } from "../shared/config-transfer";
import {
  languageName,
  currentUiLocale,
  serviceName,
  setUiLocaleOverride,
  t,
  type I18nKey,
} from "../shared/i18n";
import { useKConfig, type KConfigUpdater } from "../shared/k-config";
import {
  clearCache,
  getCacheCount,
  testServiceConnection,
} from "../shared/runtime";
import { ExpandedFeatureCards, LanguageRuleCards } from "./expanded-panels";
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
  const { config, error, updateConfig } = useKConfig();

  if (!config) {
    return (
      <main class="options-loading">
        <p class={error ? "ui-status ui-status-error" : "ui-status"}>
          {error ? t("common.saveFailed") : t("common.loading")}
        </p>
      </main>
    );
  }

  setUiLocaleOverride(config.uiLanguage);

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
  config: KConfig;
  onPatch: KConfigUpdater;
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
          <Field label={t("basic.uiLanguage")} htmlFor="ui-language">
            <Select
              id="ui-language"
              value={config.uiLanguage}
              options={[
                { value: "auto", label: t("common.auto") },
                { value: "zh-CN", label: "简体中文" },
                { value: "zh-TW", label: "繁體中文" },
                { value: "ja", label: "日本語" },
                { value: "en", label: "English" },
              ]}
              onChange={(uiLanguage) =>
                save(onPatch, {
                  uiLanguage: uiLanguage as KConfig["uiLanguage"],
                })
              }
            />
          </Field>
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
  const [selectedService, setSelectedService] = useState(
    serviceIds.includes("openai-compatible")
      ? "openai-compatible"
      : (serviceIds[0] ?? ""),
  );
  const service = config.services[selectedService];
  return (
    <div class="options-stack">
      <p class="ui-status">{t("services.description")}</p>
      <Field label="选择服务" htmlFor="service-editor-select">
        <Select
          id="service-editor-select"
          value={selectedService}
          options={serviceIds.map((serviceId) => ({
            value: serviceId,
            label: serviceName(serviceId),
          }))}
          onChange={setSelectedService}
        />
      </Field>
      {service ? (
        <ServiceCard
          key={selectedService}
          serviceId={selectedService}
          service={service}
          onPatch={onPatch}
        />
      ) : null}
    </div>
  );
}

interface ServiceCardProps {
  serviceId: string;
  service: ServiceConfig;
  onPatch: KConfigUpdater;
}

function ServiceCard({
  serviceId,
  service,
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
        {serviceFields(
          serviceId,
          currentUiLocale() === "en" ? "en" : "zh-CN",
        ).map((field) => (
          <ServiceField
            key={field.name}
            descriptor={field}
            serviceId={serviceId}
            service={service}
            showKey={showKey}
            onToggleKey={() => setShowKey((value) => !value)}
            onChange={(value) =>
              updateService(serviceFieldPatch(field.name, value))
            }
          />
        ))}
      </div>
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

function ServiceField({
  descriptor,
  serviceId,
  service,
  showKey,
  onToggleKey,
  onChange,
}: {
  descriptor: ServiceFieldDescriptor;
  serviceId: string;
  service: ServiceConfig;
  showKey: boolean;
  onToggleKey: () => void;
  onChange: (value: string) => void;
}): preact.JSX.Element {
  const id = `${serviceId}-${descriptor.name}`;
  const value = serviceFieldValue(service, descriptor.name);
  const label = descriptor.label;
  if (descriptor.type === "checkbox") {
    return (
      <Toggle
        checked={value === "true"}
        label={label}
        onChange={(checked) => onChange(String(checked))}
      />
    );
  }
  if (descriptor.type === "select") {
    return (
      <Field label={label} htmlFor={id}>
        <Select
          id={id}
          value={value}
          options={(descriptor.options ?? []).map((option) => ({
            value: option,
            label: option,
          }))}
          onChange={onChange}
        />
      </Field>
    );
  }
  if (descriptor.type === "textarea") {
    return (
      <Field label={label} htmlFor={id}>
        <textarea
          id={id}
          placeholder={
            descriptor.name === "promptSystem"
              ? DEFAULT_PROMPTS.default.system
              : descriptor.name === "promptUser"
                ? DEFAULT_PROMPTS.default.user
                : undefined
          }
          value={value}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      </Field>
    );
  }
  const modelOptions =
    descriptor.type === "model"
      ? getModels(serviceId, service.models)
      : undefined;
  const input = (
    <input
      id={id}
      type={
        descriptor.type === "password" && showKey
          ? "text"
          : descriptor.type === "model"
            ? "text"
            : descriptor.type
      }
      list={modelOptions?.length ? `${id}-models` : undefined}
      value={value}
      onInput={(event) => onChange(event.currentTarget.value)}
    />
  );
  return (
    <Field label={label} htmlFor={id}>
      {descriptor.type === "password" ? (
        <div class="password-field">
          {input}
          <button type="button" onClick={onToggleKey}>
            {t(showKey ? "common.hide" : "common.show")}
          </button>
        </div>
      ) : (
        <>
          {input}
          {modelOptions?.length ? (
            <datalist id={`${id}-models`}>
              {modelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          ) : null}
        </>
      )}
    </Field>
  );
}

function serviceFieldValue(
  service: ServiceConfig,
  key: ServiceFieldDescriptor["name"],
): string {
  const value = service[key];
  if (key === "models") return service.models?.join("\n") ?? "";
  if (key === "headers") return value ? JSON.stringify(value, null, 2) : "";
  return value === undefined ? "" : String(value);
}

function serviceFieldPatch(
  key: ServiceFieldDescriptor["name"],
  value: string,
): Partial<ServiceConfig> {
  if (key === "stream") return { stream: value === "true" };
  if (key === "models") {
    return {
      models: value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }
  if (key === "headers") {
    try {
      const headers: unknown = value ? JSON.parse(value) : undefined;
      return headers && typeof headers === "object" && !Array.isArray(headers)
        ? { headers: headers as Record<string, string> }
        : { headers: undefined };
    } catch {
      return {};
    }
  }
  if (
    key === "temperature" ||
    key === "maxTokens" ||
    key === "timeoutMs" ||
    key === "maxBatchSize" ||
    key === "maxBatchChars"
  ) {
    return {
      [key]: value ? Number(value) : undefined,
    } as Partial<ServiceConfig>;
  }
  return { [key]: value || undefined } as Partial<ServiceConfig>;
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
          onChange={(enabled) =>
            save(onPatch, {
              selection: { ...config.selection, enabled },
            })
          }
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
      <ExpandedFeatureCards config={config} onPatch={onPatch} />
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
  const [remoteRules, setRemoteRules] = useState(config.remoteRules);
  const [remoteStatus, setRemoteStatus] = useState<string>();

  const saveRemoteRules = async (): Promise<void> => {
    const valid = remoteRules.every(({ url }) => {
      try {
        return ["http:", "https:"].includes(new URL(url).protocol);
      } catch {
        return false;
      }
    });
    if (!valid) {
      setRemoteStatus("规则 URL 必须是有效的 HTTP(S) 地址");
      return;
    }
    try {
      await onPatch({ remoteRules });
      setRemoteStatus("远程规则订阅已保存");
    } catch {
      setRemoteStatus(t("common.saveFailed"));
    }
  };

  const validateRules = async (): Promise<void> => {
    let value: unknown;
    try {
      value = JSON.parse(ruleText);
    } catch {
      setValidation({ ok: false, message: t("rules.invalidJson") });
      return;
    }

    if (!Array.isArray(value)) {
      setValidation({
        ok: false,
        message: t("rules.invalidSchema", { detail: "[]: Expected an array" }),
      });
      return;
    }

    const results = await Promise.all(
      value.map((rule) =>
        sendToBackground({
          type: "validateRule",
          rule: rule as JsonValue,
        }),
      ),
    );
    const invalid = results.find((result) => !result.ok);
    if (invalid) {
      setValidation({
        ok: false,
        message: t("rules.invalidSchema", {
          detail: invalid.errors[0] ?? "Invalid rule",
        }),
      });
      return;
    }

    try {
      const rules = value as Rule[];
      await onPatch({ userRules: rules });
      setRuleText(JSON.stringify(rules, null, 2));
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
      <Card title="远程规则订阅">
        <div class="form-stack">
          {remoteRules.map((subscription, index) => (
            <div class="remote-rule-row" key={index}>
              <input
                type="url"
                aria-label={`规则 URL ${index + 1}`}
                value={subscription.url}
                onInput={(event) =>
                  setRemoteRules((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, url: event.currentTarget.value }
                        : item,
                    ),
                  )
                }
              />
              <Toggle
                checked={subscription.enabled}
                label="启用"
                onChange={(enabled) =>
                  setRemoteRules((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, enabled } : item,
                    ),
                  )
                }
              />
              <Button
                variant="quiet"
                aria-label={`移除远程规则 ${index + 1}`}
                onClick={() =>
                  setRemoteRules((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                {t("common.remove")}
              </Button>
            </div>
          ))}
          <div class="rules-actions">
            <Button
              onClick={() =>
                setRemoteRules((current) => [
                  ...current,
                  { url: "https://", enabled: true },
                ])
              }
            >
              添加订阅
            </Button>
            <Button variant="primary" onClick={() => void saveRemoteRules()}>
              保存订阅
            </Button>
          </div>
          {remoteStatus && <p role="status">{remoteStatus}</p>}
        </div>
      </Card>
      <LanguageRuleCards config={config} onPatch={onPatch} />
    </div>
  );
}

function GlossaryPanel({ config, onPatch }: PanelProps): preact.JSX.Element {
  const updateEntry = (
    index: number,
    key: "k" | "v" | "domain",
    value: string,
  ): void => {
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
        <span>适用域名</span>
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
              <input
                type="text"
                aria-label={`适用域名 ${index + 1}`}
                value={entry.domain ?? ""}
                onInput={(event) =>
                  updateEntry(index, "domain", event.currentTarget.value)
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

function ShortcutsPanel({ config }: { config: KConfig }): preact.JSX.Element {
  const shortcutLabels: Record<string, I18nKey> = {
    toggleTranslatePage: "shortcuts.toggle",
    toggleTranslateTheWholePage: "shortcuts.wholePage",
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
        <div class="form-grid two-columns">
          <Toggle
            checked={config.cache.enabled}
            label="启用译文缓存"
            onChange={(enabled) =>
              void onPatch({ cache: { ...config.cache, enabled } })
            }
          />
          <Field label="缓存保留天数" htmlFor="cache-max-age">
            <input
              id="cache-max-age"
              type="number"
              min="1"
              value={config.cache.maxAgeDays}
              onInput={(event) => {
                const maxAgeDays = Number(event.currentTarget.value);
                if (Number.isInteger(maxAgeDays) && maxAgeDays > 0) {
                  void onPatch({
                    cache: { ...config.cache, maxAgeDays },
                  });
                }
              }}
            />
          </Field>
        </div>
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

function save(
  update: KConfigUpdater,
  patch:
    | Partial<Omit<KConfig, "version">>
    | ((config: KConfig) => Partial<Omit<KConfig, "version">>),
): void {
  void update(patch).catch(console.error);
}

const root = document.getElementById("app");
if (root) render(<Options />, root);
