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
): ParsedInputTranslation {
  let text = value.replace(/\s{3,}$/, "");
  if (text.startsWith("//")) text = text.slice(2).trimStart();

  const language = text.match(/^\/([a-z]{2,3}(?:-[a-z0-9]{2,8})?)\s+/i);
  if (language) {
    return {
      text: text.slice(language[0].length).trim(),
      targetLanguage: language[1],
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
  if (!ctx.config.input.enabled) return () => undefined;

  const spaceTimes = new WeakMap<EditableField, number[]>();
  let pending: PendingTranslation | null = null;
  let disposed = false;

  const cancelPending = (): void => {
    if (!pending) return;
    pending.cancelled = true;
    pending.restore();
    pending = null;
  };

  const translate = (field: EditableField, rawValue: string): void => {
    if (pending) return;
    const parsed = parseTranslationInput(
      rawValue,
      ctx.config.input.targetLanguage ?? "en",
    );
    if (!parsed.text) return;
    if (
      parsed.text.length > INPUT_CONFIRM_LENGTH &&
      !window.confirm(`Translate ${parsed.text.length} characters?`)
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
      .translateText(
        parsed.text,
        ctx.config.sourceLanguage,
        parsed.targetLanguage,
      )
      .then((translation) => {
        if (disposed || operation.cancelled) return;
        operation.restore();
        pending = null;
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
      (value.startsWith("//") ||
        /^\/[a-z]{2,3}(?:-[a-z0-9]{2,8})?\s+/i.test(value))
    ) {
      event.preventDefault();
      spaceTimes.delete(field);
      translate(field, value);
      return;
    }

    if (event.key !== " ") {
      spaceTimes.delete(field);
      return;
    }

    const now = Date.now();
    const times = (spaceTimes.get(field) ?? []).filter(
      (time) => now - time <= INPUT_TRIGGER_WINDOW_MS,
    );
    times.push(now);
    spaceTimes.set(field, times);

    if (value.endsWith("  ") && isTripleSpaceTrigger(times)) {
      event.preventDefault();
      spaceTimes.delete(field);
      translate(field, `${value} `);
    }
  };

  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    disposed = true;
    cancelPending();
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
