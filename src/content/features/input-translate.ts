import {
  DEFAULT_INPUT_LANGUAGE_ALIASES,
  withKDefaults,
} from "../../shared/k-types";
import type { LangCode } from "../../shared/types";
import { languageName, setUiLocaleOverride, t } from "../../ui/shared/i18n";
import type { FeatureContext } from "./context";

export const INPUT_TRIGGER_WINDOW_MS = 1_500;
export const INPUT_CONFIRM_LENGTH = 200;

export interface ParsedInputTranslation {
  text: string;
  targetLanguage: string;
}

type EditableField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

interface PendingTranslation {
  field: EditableField;
  cancelled: boolean;
  restore(): void;
}

/** Strip trigger syntax and read an optional leading language code. */
export function parseTranslationInput(
  value: string,
  defaultTargetLanguage = "en",
  aliases: Readonly<
    Record<string, readonly string[]>
  > = DEFAULT_INPUT_LANGUAGE_ALIASES,
  startingTriggerKey = "/",
): ParsedInputTranslation {
  let text = value.replace(/\s{3,}$/, "");
  if (text.startsWith("//")) text = text.slice(2).trimStart();

  const language = readLanguagePrefix(text, aliases, startingTriggerKey);
  if (language) {
    return {
      text: text.slice(language.length).trim(),
      targetLanguage: language.language,
    };
  }

  return { text: text.trim(), targetLanguage: defaultTargetLanguage };
}

/** Return true when the latest three space presses fit inside the trigger window. */
export function isTripleSpaceTrigger(times: readonly number[]): boolean {
  if (times.length < 3) return false;
  const recent = times.slice(-3);
  return recent[2] - recent[0] <= INPUT_TRIGGER_WINDOW_MS;
}

export function isRepeatedKeyTrigger(
  times: readonly number[],
  repeatCount: number,
  timeoutMs: number,
): boolean {
  if (times.length < repeatCount) return false;
  const recent = times.slice(-repeatCount);
  return recent[recent.length - 1]! - recent[0]! <= timeoutMs;
}

export function resolveAutoTargetLanguage(
  text: string,
  fallback: LangCode = "zh-CN",
): LangCode {
  if (/\p{Script=Han}/u.test(text)) return "en";
  if (/\p{Letter}/u.test(text)) return "zh-CN";
  return fallback;
}

function readLanguagePrefix(
  text: string,
  aliases: Readonly<Record<string, readonly string[]>>,
  startingTriggerKey: string,
): { language: string; length: number } | undefined {
  if (!text.startsWith(startingTriggerKey)) return undefined;
  const rest = text.slice(startingTriggerKey.length);
  const separator = rest.search(/\s/u);
  if (separator <= 0) return undefined;
  const token = rest.slice(0, separator).toLowerCase();
  for (const [language, values] of Object.entries(aliases)) {
    if (
      language.toLowerCase() === token ||
      values.some((value) => value.toLowerCase() === token)
    ) {
      return {
        language,
        length: startingTriggerKey.length + separator + 1,
      };
    }
  }
  if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(token)) {
    return {
      language: token,
      length: startingTriggerKey.length + separator + 1,
    };
  }
  return undefined;
}

function findEditable(target: EventTarget | null): EditableField | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest(
    "input, textarea, [contenteditable]:not([contenteditable='false'])",
  );
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLElement
  ) {
    return field;
  }
  return null;
}

function fieldValue(field: EditableField): string {
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    return field.value;
  }
  return field.textContent ?? "";
}

function disableField(field: EditableField): () => void {
  const previousBusy = field.getAttribute("aria-busy");
  field.setAttribute("aria-busy", "true");

  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    const wasDisabled = field.disabled;
    field.disabled = true;
    return () => {
      field.disabled = wasDisabled;
      if (previousBusy === null) field.removeAttribute("aria-busy");
      else field.setAttribute("aria-busy", previousBusy);
    };
  }

  const contentEditable = field.getAttribute("contenteditable");
  field.setAttribute("contenteditable", "false");
  return () => {
    if (contentEditable === null) field.removeAttribute("contenteditable");
    else field.setAttribute("contenteditable", contentEditable);
    if (previousBusy === null) field.removeAttribute("aria-busy");
    else field.setAttribute("aria-busy", previousBusy);
  };
}

function replaceInputValue(
  field: HTMLInputElement | HTMLTextAreaElement,
  translation: string,
): void {
  field.focus();
  field.setSelectionRange(0, field.value.length);
  let inserted: boolean;
  try {
    inserted = document.execCommand("insertText", false, translation);
  } catch {
    inserted = false;
  }
  if (!inserted) {
    field.value = translation;
    field.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: translation,
      }),
    );
  }
}

function replaceContentEditable(field: HTMLElement, translation: string): void {
  field.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(field);
  selection?.removeAllRanges();
  selection?.addRange(range);
  selection?.deleteFromDocument();
  const text = document.createTextNode(translation);
  range.insertNode(text);
  range.setStartAfter(text);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  field.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: translation,
    }),
  );
}

/** Install inline translation triggers for editable fields. */
export function init(ctx: FeatureContext): () => void {
  const config = withKDefaults(ctx.config);
  setUiLocaleOverride(config.uiLanguage);
  if (!config.input.enabled) return () => undefined;

  const keyTimes = new WeakMap<EditableField, number[]>();
  const selectedTargets = new WeakMap<
    EditableField,
    LangCode | "auto-target"
  >();
  let pending: PendingTranslation | null = null;
  let disposed = false;
  let targetBar: HTMLElement | null = null;

  const hideTargetBar = (): void => {
    targetBar?.remove();
    targetBar = null;
  };

  const showTargetBar = (field: EditableField): void => {
    if (!config.input.showTargetBar) return;
    hideTargetBar();
    const host = document.createElement("div");
    host.dataset.imt = "input-target";
    const rect = field.getBoundingClientRect();
    host.style.cssText = [
      "position:fixed",
      `left:${Math.max(8, rect.left)}px`,
      `top:${Math.max(8, rect.top - 42)}px`,
      "z-index:2147483647",
    ].join(";");
    const shadow = host.attachShadow({ mode: "open" });
    const select = document.createElement("select");
    select.setAttribute("aria-label", t("popup.targetLanguage"));
    const automatic = document.createElement("option");
    automatic.value = "auto-target";
    automatic.textContent = t("common.auto");
    select.append(automatic);
    for (const language of ["en", "zh-CN", "zh-TW", "ja", "ko"] as const) {
      const option = document.createElement("option");
      option.value = language;
      option.textContent = languageName(language);
      select.append(option);
    }
    select.value =
      selectedTargets.get(field) ??
      (config.input.autoTargetLanguage
        ? "auto-target"
        : (config.input.targetLanguage ?? "en"));
    select.addEventListener("change", () => {
      selectedTargets.set(field, select.value as LangCode | "auto-target");
    });
    const style = document.createElement("style");
    style.textContent = `:host{font:13px system-ui}select{min-width:150px;padding:7px 28px 7px 9px;border:1px solid #cbd5e1;border-radius:8px;color:#111827;background:#fff;box-shadow:0 4px 14px rgb(0 0 0 / 18%)}`;
    shadow.append(style, select);
    document.documentElement.append(host);
    targetBar = host;
  };

  const cancelPending = (): void => {
    if (!pending) return;
    pending.cancelled = true;
    pending.restore();
    pending = null;
    hideTargetBar();
  };

  const translate = (field: EditableField, rawValue: string): void => {
    if (pending) return;
    const chosenTarget = selectedTargets.get(field);
    const automaticTarget = resolveAutoTargetLanguage(
      rawValue,
      config.input.targetLanguage ?? "en",
    );
    const fallbackTarget =
      chosenTarget === "auto-target" ||
      (!chosenTarget && config.input.autoTargetLanguage)
        ? automaticTarget
        : (chosenTarget ?? config.input.targetLanguage ?? "en");
    const parsed = parseTranslationInput(
      rawValue,
      fallbackTarget,
      config.input.languageAliases,
      config.input.startingTriggerKey,
    );
    if (!parsed.text) return;
    if (
      parsed.text.length > INPUT_CONFIRM_LENGTH &&
      !window.confirm(t("input.confirmLong", { count: parsed.text.length }))
    ) {
      return;
    }

    const operation: PendingTranslation = {
      field,
      cancelled: false,
      restore: disableField(field),
    };
    pending = operation;

    void ctx
      .translateText(parsed.text, config.sourceLanguage, parsed.targetLanguage)
      .then((translation) => {
        if (disposed || operation.cancelled) return;
        operation.restore();
        pending = null;
        hideTargetBar();
        if (
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement
        ) {
          replaceInputValue(field, translation);
        } else {
          replaceContentEditable(field, translation);
        }
      })
      .catch(() => {
        if (!operation.cancelled) operation.restore();
        if (pending === operation) pending = null;
      });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && pending) {
      event.preventDefault();
      cancelPending();
      return;
    }
    if (event.isComposing || pending) return;

    const field = findEditable(event.target);
    if (!field) return;
    const value = fieldValue(field);

    if (
      event.key === "Enter" &&
      config.input.triggerMode !== "trailing" &&
      value.startsWith(config.input.startingTriggerKey)
    ) {
      event.preventDefault();
      keyTimes.delete(field);
      translate(field, value);
      return;
    }

    const trailingKey = normalizedTriggerKey(config.input.trailingTriggerKey);
    if (event.key !== trailingKey) {
      keyTimes.delete(field);
      return;
    }

    if (config.input.triggerMode === "prefix") return;
    showTargetBar(field);

    const now = Date.now();
    const times = (keyTimes.get(field) ?? []).filter(
      (time) => now - time <= config.input.trailingTriggerTimeoutMs,
    );
    times.push(now);
    keyTimes.set(field, times);

    if (
      value.endsWith(
        trailingKey.repeat(config.input.trailingTriggerCount - 1),
      ) &&
      isRepeatedKeyTrigger(
        times,
        config.input.trailingTriggerCount,
        config.input.trailingTriggerTimeoutMs,
      )
    ) {
      event.preventDefault();
      keyTimes.delete(field);
      translate(
        field,
        value.slice(
          0,
          -trailingKey.length * (config.input.trailingTriggerCount - 1),
        ),
      );
    }
  };

  const onInput = (event: Event): void => {
    const field = findEditable(event.target);
    if (!field || config.input.triggerMode === "trailing") return;
    if (fieldValue(field).startsWith(config.input.startingTriggerKey)) {
      showTargetBar(field);
    }
  };

  const onFocusOut = (event: FocusEvent): void => {
    const field = findEditable(event.target);
    if (!field) return;
    setTimeout(() => {
      if (!targetBar?.matches(":hover")) hideTargetBar();
    }, 0);
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("focusout", onFocusOut, true);

  return () => {
    disposed = true;
    cancelPending();
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("focusout", onFocusOut, true);
  };
}

function normalizedTriggerKey(value: string): string {
  if (value === "space") return " ";
  if (value === "tab") return "Tab";
  return value || " ";
}
