import { useState } from "preact/hooks";

import type {
  KConfig,
  PatternModeConfig,
  TranslationThemePatterns,
} from "../../shared/k-types";
import { LANGUAGE_CODES } from "../../shared/lang";
import type { LangCode } from "../../shared/types";
import { Card, Field, Select, Toggle } from "../shared/components";
import { languageName, serviceName, t } from "../shared/i18n";
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
  const targetLanguageOptions = [
    { value: "", label: "跟随全局设置" },
    ...LANGUAGE_CODES.filter((code) => code !== "auto").map((code) => ({
      value: code,
      label: languageName(code),
    })),
  ];

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
          <Field label="输入框目标语言" htmlFor="input-target-language">
            <Select
              id="input-target-language"
              value={config.input.targetLanguage ?? ""}
              options={targetLanguageOptions}
              onChange={(targetLanguage) =>
                void onPatch((current) => ({
                  input: {
                    ...current.input,
                    targetLanguage: (targetLanguage || undefined) as
                      LangCode | undefined,
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
        <div class="form-stack options-inline-toggles">
          <Toggle
            checked={config.subtitle.enabled}
            label={t("common.enabled")}
            onChange={(enabled) => patchSubtitle(onPatch, config, { enabled })}
          />
          <Toggle
            checked={config.subtitle.youtube}
            label="YouTube"
            onChange={(youtube) => patchSubtitle(onPatch, config, { youtube })}
          />
          <Toggle
            checked={config.subtitle.preTranslation}
            label="字幕预翻译"
            onChange={(preTranslation) =>
              patchSubtitle(onPatch, config, { preTranslation })
            }
          />
        </div>
        <div class="form-grid two-columns">
          <Field label={t("features.subtitleMode")} htmlFor="subtitle-mode">
            <Select
              id="subtitle-mode"
              value={config.subtitle.mode}
              options={[
                { value: "dual", label: t("mode.dual") },
                { value: "translation-only", label: t("mode.translation") },
                { value: "source-only", label: t("writing.source") },
              ]}
              onChange={(mode) =>
                patchSubtitle(onPatch, config, {
                  mode: mode as KConfig["subtitle"]["mode"],
                })
              }
            />
          </Field>
          <NumberField
            id="subtitle-font-size"
            label={t("features.subtitleFontSize")}
            value={config.subtitle.fontSize}
            onChange={(fontSize) =>
              patchSubtitle(onPatch, config, { fontSize })
            }
          />
          <TextField
            id="subtitle-color"
            label="原文颜色"
            value={config.subtitle.sourceColor}
            onChange={(sourceColor) =>
              patchSubtitle(onPatch, config, { sourceColor })
            }
          />
          <TextField
            id="subtitle-translation-color"
            label="译文颜色"
            value={config.subtitle.translationColor}
            onChange={(translationColor) =>
              patchSubtitle(onPatch, config, { translationColor })
            }
          />
          <TextField
            id="subtitle-background"
            label={t("features.subtitleBackground")}
            value={config.subtitle.backgroundColor}
            onChange={(backgroundColor) =>
              patchSubtitle(onPatch, config, { backgroundColor })
            }
          />
          <Field label="背景透明度" htmlFor="subtitle-opacity">
            <input
              id="subtitle-opacity"
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={config.subtitle.backgroundOpacity}
              onInput={(event) => {
                const backgroundOpacity = Number(event.currentTarget.value);
                if (backgroundOpacity >= 0 && backgroundOpacity <= 1) {
                  patchSubtitle(onPatch, config, { backgroundOpacity });
                }
              }}
            />
          </Field>
          <Field
            label={t("features.subtitlePosition")}
            htmlFor="subtitle-position"
          >
            <Select
              id="subtitle-position"
              value={config.subtitle.position}
              options={[
                { value: "bottom", label: "底部" },
                { value: "center", label: "中部" },
                { value: "top", label: "顶部" },
              ]}
              onChange={(position) =>
                patchSubtitle(onPatch, config, {
                  position: position as KConfig["subtitle"]["position"],
                })
              }
            />
          </Field>
          <Field label="水平偏移" htmlFor="subtitle-offset-x">
            <input
              id="subtitle-offset-x"
              type="number"
              value={config.subtitle.offsetX}
              onInput={(event) =>
                patchSubtitle(onPatch, config, {
                  offsetX: Number(event.currentTarget.value),
                })
              }
            />
          </Field>
          <Field label="垂直偏移" htmlFor="subtitle-offset-y">
            <input
              id="subtitle-offset-y"
              type="number"
              value={config.subtitle.offsetY}
              onInput={(event) =>
                patchSubtitle(onPatch, config, {
                  offsetY: Number(event.currentTarget.value),
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card title={t("features.pdf")}>
        <div class="form-stack">
          <Toggle
            checked={config.pdf.interceptLinks}
            label={t("features.pdfAutoOpen")}
            onChange={(interceptLinks) =>
              void onPatch({ pdf: { ...config.pdf, interceptLinks } })
            }
          />
          <Field label="PDF 显示模式" htmlFor="pdf-mode">
            <Select
              id="pdf-mode"
              value={config.pdf.mode}
              options={[
                { value: "dual", label: t("mode.dual") },
                { value: "translation", label: t("mode.translation") },
              ]}
              onChange={(mode) =>
                void onPatch({
                  pdf: {
                    ...config.pdf,
                    mode: mode as KConfig["pdf"]["mode"],
                  },
                })
              }
            />
          </Field>
          <TextField
            id="pdf-theme"
            label="PDF 译文主题"
            value={config.pdf.theme}
            onChange={(theme) =>
              void onPatch({ pdf: { ...config.pdf, theme } })
            }
          />
        </div>
      </Card>

      <Card title="搜索增强">
        <Toggle
          checked={config.searchEnhancement.enabled}
          label={t("common.enabled")}
          onChange={(enabled) =>
            void onPatch({ searchEnhancement: { enabled } })
          }
        />
      </Card>

      <Card title="网页翻译高级设置">
        <div class="form-stack options-inline-toggles">
          <Toggle
            checked={config.translateMainOnly}
            label="默认只翻译正文"
            onChange={(translateMainOnly) =>
              void onPatch({ translateMainOnly })
            }
          />
          <Toggle
            checked={config.translateToPageEndImmediately}
            label="立即翻译到页面底部"
            onChange={(translateToPageEndImmediately) =>
              void onPatch({ translateToPageEndImmediately })
            }
          />
          <Toggle
            checked={config.translationMask}
            label="遮罩模式"
            onChange={(translationMask) => void onPatch({ translationMask })}
          />
          <Toggle
            checked={config.enableEditTranslation}
            label="允许编辑译文"
            onChange={(enableEditTranslation) =>
              void onPatch({ enableEditTranslation })
            }
          />
          <Toggle
            checked={config.hoverTranslateDirectly}
            label="悬停直接翻译"
            onChange={(hoverTranslateDirectly) =>
              void onPatch({ hoverTranslateDirectly })
            }
          />
        </div>
        <div class="form-grid two-columns">
          <NumberField
            id="immediate-concurrency"
            label="立即翻译并发数"
            value={config.immediateTranslationConcurrency}
            onChange={(immediateTranslationConcurrency) =>
              void onPatch({ immediateTranslationConcurrency })
            }
          />
          <NumberField
            id="main-frame-minimum"
            label="子框架最少字数"
            value={config.mainFrameMinTextCount}
            onChange={(mainFrameMinTextCount) =>
              void onPatch({ mainFrameMinTextCount })
            }
          />
          <NumberField
            id="context-word-limit"
            label="上下文词数上限"
            value={config.contextWordLimit}
            onChange={(contextWordLimit) => void onPatch({ contextWordLimit })}
          />
          <TextField
            id="translation-font-size"
            label="译文字号"
            value={String(config.translationFontSize ?? "")}
            onChange={(translationFontSize) =>
              void onPatch({
                translationFontSize: translationFontSize || undefined,
              })
            }
          />
          <TextField
            id="translation-color"
            label="译文颜色"
            value={config.translationColor ?? ""}
            onChange={(translationColor) =>
              void onPatch({ translationColor: translationColor || undefined })
            }
          />
          <TextField
            id="translation-line-height"
            label="译文行高"
            value={String(config.translationLineHeight ?? "")}
            onChange={(translationLineHeight) =>
              void onPatch({
                translationLineHeight: translationLineHeight || undefined,
              })
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
          <Field label="侧边栏目标语言" htmlFor="side-panel-language">
            <Select
              id="side-panel-language"
              value={config.sidePanel.targetLanguage ?? ""}
              options={targetLanguageOptions}
              onChange={(targetLanguage) =>
                void onPatch({
                  sidePanel: {
                    ...config.sidePanel,
                    targetLanguage: (targetLanguage || undefined) as
                      LangCode | undefined,
                  },
                })
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
          <Field label="AI 写作目标语言" htmlFor="ai-writing-language">
            <Select
              id="ai-writing-language"
              value={config.aiWriting.targetLanguage ?? ""}
              options={targetLanguageOptions}
              onChange={(targetLanguage) =>
                void onPatch({
                  aiWriting: {
                    ...config.aiWriting,
                    targetLanguage: (targetLanguage || undefined) as
                      LangCode | undefined,
                  },
                })
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
          value={config.globalCustomCss}
          onInput={(event) =>
            void onPatch({ globalCustomCss: event.currentTarget.value })
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
  patch: Partial<KConfig["subtitle"]>,
): void {
  void onPatch({
    subtitle: { ...config.subtitle, ...patch },
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
