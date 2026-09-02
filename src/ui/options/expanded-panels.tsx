import { useState } from "preact/hooks";

import type {
  KConfig,
  PatternModeConfig,
  TranslationThemePatterns,
} from "../../shared/k-types";
import type { LangCode } from "../../shared/types";
import { Card, Field, Select, Toggle } from "../shared/components";
import { serviceName, t } from "../shared/i18n";
import type { KConfigUpdater } from "../shared/k-config";

interface ExpandedPanelProps {
  config: KConfig;
  onPatch: KConfigUpdater;
}

export function ExpandedFeatureCards({
  config,
  onPatch,
}: ExpandedPanelProps): preact.JSX.Element {
  const serviceOptions = Object.keys(config.services).map((id) => ({
    value: id,
    label: serviceName(id),
  }));

  return (
    <>
      <Card title={t("features.inputMode")}>
        <div class="form-grid two-columns">
          <Field label={t("features.inputMode")} htmlFor="input-trigger-mode">
            <Select
              id="input-trigger-mode"
              value={config.input.triggerMode}
              options={[
                { value: "prefix", label: t("features.triggerPrefix") },
                { value: "trailing", label: t("features.triggerTrailing") },
                { value: "both", label: t("features.triggerBoth") },
              ]}
              onChange={(triggerMode) =>
                void onPatch((current) => ({
                  input: {
                    ...current.input,
                    triggerMode: triggerMode as KConfig["input"]["triggerMode"],
                  },
                }))
              }
            />
          </Field>
          <TextField
            id="input-starting-key"
            label={t("features.startingKey")}
            value={config.input.startingTriggerKey}
            onChange={(startingTriggerKey) =>
              void onPatch((current) => ({
                input: { ...current.input, startingTriggerKey },
              }))
            }
          />
          <TextField
            id="input-trailing-key"
            label={t("features.trailingKey")}
            value={
              config.input.trailingTriggerKey === " "
                ? "space"
                : config.input.trailingTriggerKey
            }
            onChange={(value) =>
              void onPatch((current) => ({
                input: {
                  ...current.input,
                  trailingTriggerKey: value === "space" ? " " : value,
                },
              }))
            }
          />
          <NumberField
            id="input-trigger-count"
            label={t("features.trailingCount")}
            value={config.input.trailingTriggerCount}
            onChange={(trailingTriggerCount) =>
              void onPatch((current) => ({
                input: { ...current.input, trailingTriggerCount },
              }))
            }
          />
          <NumberField
            id="input-trigger-timeout"
            label={t("features.trailingTimeout")}
            value={config.input.trailingTriggerTimeoutMs}
            onChange={(trailingTriggerTimeoutMs) =>
              void onPatch((current) => ({
                input: { ...current.input, trailingTriggerTimeoutMs },
              }))
            }
          />
        </div>
        <div class="form-stack options-inline-toggles">
          <Toggle
            checked={config.input.showTargetBar}
            label={t("features.targetBar")}
            onChange={(showTargetBar) =>
              void onPatch((current) => ({
                input: { ...current.input, showTargetBar },
              }))
            }
          />
          <Toggle
            checked={config.input.autoTargetLanguage}
            label={t("features.autoTarget")}
            onChange={(autoTargetLanguage) =>
              void onPatch((current) => ({
                input: { ...current.input, autoTargetLanguage },
              }))
            }
          />
        </div>
        <JsonField
          label={t("features.languageAliases")}
          value={config.input.languageAliases}
          onChange={(languageAliases) =>
            void onPatch((current) => ({
              input: { ...current.input, languageAliases },
            }))
          }
        />
      </Card>

      <Card title={t("features.selectionDetails")}>
        <div class="form-stack">
          <Toggle
            checked={config.selection.dictionary}
            label={t("features.dictionary")}
            onChange={(dictionary) =>
              void onPatch((current) => ({
                selection: { ...current.selection, dictionary },
              }))
            }
          />
          <Toggle
            checked={config.selection.autoRead}
            label={t("features.autoRead")}
            onChange={(autoRead) =>
              void onPatch((current) => ({
                selection: { ...current.selection, autoRead },
              }))
            }
          />
          <Field
            label={t("features.selectionTrigger")}
            htmlFor="selection-trigger-mode"
          >
            <Select
              id="selection-trigger-mode"
              value={config.selection.triggerMode}
              options={[
                { value: "icon-hover", label: t("features.iconHover") },
                { value: "icon-click", label: t("features.iconClick") },
                { value: "direct", label: t("features.direct") },
              ]}
              onChange={(triggerMode) =>
                void onPatch((current) => ({
                  selection: {
                    ...current.selection,
                    triggerMode:
                      triggerMode as KConfig["selection"]["triggerMode"],
                  },
                }))
              }
            />
          </Field>
          <Field label={t("features.sitePatterns")} htmlFor="selection-sites">
            <textarea
              id="selection-sites"
              value={config.selection.enabledPatterns.join("\n")}
              onInput={(event) =>
                void onPatch((current) => ({
                  selection: {
                    ...current.selection,
                    enabledPatterns: lines(event.currentTarget.value),
                  },
                }))
              }
            />
          </Field>
          <JsonField
            label={t("features.voiceMap")}
            value={config.selection.voiceByLanguage}
            onChange={(voiceByLanguage) =>
              void onPatch((current) => ({
                selection: { ...current.selection, voiceByLanguage },
              }))
            }
          />
        </div>
      </Card>

      <Card title={t("features.subtitle")}>
        <div class="form-grid two-columns">
          <Field label={t("features.subtitleMode")} htmlFor="subtitle-mode">
            <Select
              id="subtitle-mode"
              value={config.subtitle.style.mode}
              options={[
                { value: "dual", label: t("mode.dual") },
                { value: "translation", label: t("mode.translation") },
                { value: "source", label: t("writing.source") },
              ]}
              onChange={(mode) =>
                void onPatch((current) => ({
                  subtitle: {
                    ...current.subtitle,
                    style: {
                      ...current.subtitle.style,
                      mode: mode as KConfig["subtitle"]["style"]["mode"],
                    },
                  },
                }))
              }
            />
          </Field>
          <NumberField
            id="subtitle-font-size"
            label={t("features.subtitleFontSize")}
            value={config.subtitle.style.fontSize}
            onChange={(fontSize) =>
              patchSubtitle(onPatch, config, { fontSize })
            }
          />
          <TextField
            id="subtitle-color"
            label={t("features.subtitleColor")}
            value={config.subtitle.style.color}
            onChange={(color) => patchSubtitle(onPatch, config, { color })}
          />
          <TextField
            id="subtitle-background"
            label={t("features.subtitleBackground")}
            value={config.subtitle.style.background}
            onChange={(background) =>
              patchSubtitle(onPatch, config, { background })
            }
          />
          <Field
            label={t("features.subtitlePosition")}
            htmlFor="subtitle-position"
          >
            <Select
              id="subtitle-position"
              value={config.subtitle.style.position}
              options={[
                { value: "bottom", label: "Bottom" },
                { value: "top", label: "Top" },
              ]}
              onChange={(position) =>
                patchSubtitle(onPatch, config, {
                  position: position as "top" | "bottom",
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card title={t("features.pdf")}>
        <div class="form-stack">
          <Toggle
            checked={config.pdf.enabled}
            label={t("common.enabled")}
            onChange={(enabled) =>
              void onPatch({ pdf: { ...config.pdf, enabled } })
            }
          />
          <Toggle
            checked={config.pdf.autoOpenOnline}
            label={t("features.pdfAutoOpen")}
            onChange={(autoOpenOnline) =>
              void onPatch({ pdf: { ...config.pdf, autoOpenOnline } })
            }
          />
        </div>
      </Card>

      <Card title={t("features.sidePanel")}>
        <div class="form-grid two-columns">
          <Toggle
            checked={config.sidePanel.enabled}
            label={t("common.enabled")}
            onChange={(enabled) =>
              void onPatch({ sidePanel: { ...config.sidePanel, enabled } })
            }
          />
          <Field label={t("features.aiService")} htmlFor="side-panel-service">
            <Select
              id="side-panel-service"
              value={config.sidePanel.service ?? config.service}
              options={serviceOptions}
              onChange={(service) =>
                void onPatch({ sidePanel: { ...config.sidePanel, service } })
              }
            />
          </Field>
          <NumberField
            id="side-panel-history"
            label={t("features.historyLimit")}
            value={config.sidePanel.historyLimit}
            onChange={(historyLimit) =>
              void onPatch({
                sidePanel: { ...config.sidePanel, historyLimit },
              })
            }
          />
        </div>
      </Card>

      <Card title={t("features.aiWriting")}>
        <div class="form-stack">
          <Toggle
            checked={config.aiWriting.enabled}
            label={t("common.enabled")}
            onChange={(enabled) =>
              void onPatch({ aiWriting: { ...config.aiWriting, enabled } })
            }
          />
          <Field label={t("features.aiService")} htmlFor="ai-writing-service">
            <Select
              id="ai-writing-service"
              value={config.aiWriting.service ?? config.service}
              options={serviceOptions}
              onChange={(service) =>
                void onPatch({ aiWriting: { ...config.aiWriting, service } })
              }
            />
          </Field>
          {(
            [
              ["summarize", "features.promptSummarize"],
              ["polish", "features.promptPolish"],
              ["translate", "features.promptTranslate"],
              ["suggestions", "features.promptSuggestions"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={t(label)} htmlFor={`ai-prompt-${key}`}>
              <textarea
                id={`ai-prompt-${key}`}
                value={config.aiWriting.prompts[key]}
                onInput={(event) =>
                  void onPatch((current) => ({
                    aiWriting: {
                      ...current.aiWriting,
                      prompts: {
                        ...current.aiWriting.prompts,
                        [key]: event.currentTarget.value,
                      },
                    },
                  }))
                }
              />
            </Field>
          ))}
        </div>
      </Card>
    </>
  );
}

export function LanguageRuleCards({
  config,
  onPatch,
}: ExpandedPanelProps): preact.JSX.Element {
  return (
    <>
      <Card title={t("rules.languageRules")}>
        <div class="form-grid two-columns">
          <TextField
            id="always-languages"
            label={t("rules.alwaysLanguages")}
            value={config.alwaysTranslateLangs.join(", ")}
            onChange={(value) =>
              void onPatch({ alwaysTranslateLangs: languages(value) })
            }
          />
          <TextField
            id="never-languages"
            label={t("rules.neverLanguages")}
            value={config.neverTranslateLangs.join(", ")}
            onChange={(value) =>
              void onPatch({ neverTranslateLangs: languages(value) })
            }
          />
        </div>
        <JsonField
          label={t("rules.modeByLanguage")}
          value={config.translationModeLanguagePattern}
          onChange={(translationModeLanguagePattern) =>
            void onPatch({ translationModeLanguagePattern })
          }
        />
        <JsonField
          label={t("rules.modeByUrl")}
          value={config.translationModeUrlPattern}
          onChange={(translationModeUrlPattern) =>
            void onPatch({ translationModeUrlPattern })
          }
        />
        <JsonField
          label={t("rules.themePatterns")}
          value={config.translationThemePatterns}
          onChange={(translationThemePatterns) =>
            void onPatch({ translationThemePatterns })
          }
        />
      </Card>
      <Card title={t("rules.globalCss")}>
        <textarea
          class="rules-editor rules-editor-short"
          aria-label={t("rules.globalCss")}
          spellcheck={false}
          value={config.globalCss}
          onInput={(event) =>
            void onPatch({ globalCss: event.currentTarget.value })
          }
        />
      </Card>
    </>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}): preact.JSX.Element {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="text"
        value={value}
        onInput={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}): preact.JSX.Element {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        min="1"
        value={value}
        onInput={(event) => {
          const number = Number(event.currentTarget.value);
          if (Number.isInteger(number) && number > 0) onChange(number);
        }}
      />
    </Field>
  );
}

function JsonField<T extends object>({
  label,
  value,
  onChange,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
}): preact.JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <Field label={label}>
      <textarea
        class={invalid ? "json-invalid" : ""}
        aria-label={label}
        spellcheck={false}
        value={text}
        onInput={(event) => {
          const next = event.currentTarget.value;
          setText(next);
          try {
            const parsed: unknown = JSON.parse(next);
            if (isRecord(parsed)) {
              setInvalid(false);
              onChange(parsed as T);
            } else {
              setInvalid(true);
            }
          } catch {
            setInvalid(true);
          }
        }}
      />
    </Field>
  );
}

function patchSubtitle(
  onPatch: KConfigUpdater,
  config: KConfig,
  style: Partial<KConfig["subtitle"]["style"]>,
): void {
  void onPatch({
    subtitle: {
      ...config.subtitle,
      style: { ...config.subtitle.style, ...style },
    },
  });
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function languages(value: string): LangCode[] {
  return value
    .split(/[,\s]+/)
    .map((language) => language.trim())
    .filter(Boolean) as LangCode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type { PatternModeConfig, TranslationThemePatterns };
