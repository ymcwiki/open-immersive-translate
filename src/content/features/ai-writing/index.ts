import browser from "webextension-polyfill";

import {
  createAssistantClient,
  runAssistant,
  type AssistantClient,
} from "../../../shared/k-assistant";
import { withKDefaults } from "../../../shared/k-types";
import { setUiLocaleOverride, t } from "../../../ui/shared/i18n";
import type { FeatureContext } from "../context";

type WritingAction = "summarize" | "polish" | "translate" | "suggestions";
type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

interface SavedInput {
  field: EditableTarget;
  start: number;
  end: number;
  range?: Range;
}

export interface AiWritingOptions {
  assistant?: AssistantClient;
}

/** Register the page modal and the shortcut/context-menu message. */
export function init(
  ctx: FeatureContext,
  options: AiWritingOptions = {},
): () => void {
  const config = withKDefaults(ctx.config);
  if (!config.aiWriting.enabled) return () => undefined;
  const assistant = options.assistant ?? createAssistantClient();
  let closeModal: (() => void) | undefined;

  const open = (): void => {
    closeModal?.();
    closeModal = openAiWritingModal(ctx, assistant);
  };
  const listener = (message: unknown): void => {
    if (isRecord(message) && message.type === "openAiWriting") open();
  };
  browser.runtime.onMessage.addListener(listener);

  return () => {
    closeModal?.();
    browser.runtime.onMessage.removeListener(listener);
  };
}

/** Open one isolated AI-writing modal and return its disposer. */
export function openAiWritingModal(
  ctx: FeatureContext,
  assistant: AssistantClient = createAssistantClient(),
): () => void {
  document.querySelector('[data-imt="ai-writing"]')?.remove();
  const config = withKDefaults(ctx.config);
  setUiLocaleOverride(config.uiLanguage);
  const captured = captureInput();
  const sourceText =
    captured?.text ?? window.getSelection()?.toString().trim() ?? "";

  const host = document.createElement("div");
  host.dataset.imt = "ai-writing";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${modalStyles}</style>
    <div class="backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="imt-writing-title">
        <header>
          <h2 id="imt-writing-title"></h2>
          <button class="close" type="button" data-command="close" aria-label="${t("common.close")}">×</button>
        </header>
        <label class="field"><span data-label="source"></span><textarea class="source"></textarea></label>
        <div class="actions" role="tablist"></div>
        <label class="field"><span data-label="prompt"></span><textarea class="prompt"></textarea></label>
        <button class="run" type="button" data-command="run"></button>
        <p class="status" role="status"></p>
        <section class="result-wrap" hidden>
          <h3></h3>
          <div class="result" aria-live="polite"></div>
          <footer>
            <button type="button" data-command="copy"></button>
            <button type="button" data-command="insert"></button>
          </footer>
        </section>
      </section>
    </div>
  `;

  const title = shadow.querySelector<HTMLHeadingElement>("h2")!;
  const source = shadow.querySelector<HTMLTextAreaElement>(".source")!;
  const prompt = shadow.querySelector<HTMLTextAreaElement>(".prompt")!;
  const actions = shadow.querySelector<HTMLElement>(".actions")!;
  const run = shadow.querySelector<HTMLButtonElement>('[data-command="run"]')!;
  const status = shadow.querySelector<HTMLElement>(".status")!;
  const resultWrap = shadow.querySelector<HTMLElement>(".result-wrap")!;
  const result = shadow.querySelector<HTMLElement>(".result")!;
  const resultTitle = shadow.querySelector<HTMLHeadingElement>("h3")!;
  const copy = shadow.querySelector<HTMLButtonElement>(
    '[data-command="copy"]',
  )!;
  const insert = shadow.querySelector<HTMLButtonElement>(
    '[data-command="insert"]',
  )!;

  title.textContent = t("writing.title");
  shadow.querySelector<HTMLElement>('[data-label="source"]')!.textContent =
    t("writing.source");
  shadow.querySelector<HTMLElement>('[data-label="prompt"]')!.textContent =
    t("writing.prompt");
  source.value = sourceText;
  run.textContent = t("common.run");
  resultTitle.textContent = t("writing.result");
  copy.textContent = t("common.copy");
  insert.textContent = t("common.insert");
  insert.disabled = !captured;

  const actionLabels: Record<WritingAction, string> = {
    summarize: t("writing.summarize"),
    polish: t("writing.polish"),
    translate: t("writing.translate"),
    suggestions: t("writing.suggestions"),
  };
  let activeAction: WritingAction = "summarize";
  let selectedResult = "";
  let requestNumber = 0;

  const selectAction = (action: WritingAction): void => {
    activeAction = action;
    prompt.value = config.aiWriting.prompts[action];
    for (const button of actions.querySelectorAll<HTMLButtonElement>(
      "button",
    )) {
      button.setAttribute(
        "aria-selected",
        String(button.dataset.action === action),
      );
    }
  };

  for (const action of Object.keys(actionLabels) as WritingAction[]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.setAttribute("role", "tab");
    button.textContent = actionLabels[action];
    button.addEventListener("click", () => selectAction(action));
    actions.append(button);
  }
  selectAction(activeAction);

  const renderResults = (text: string): void => {
    result.replaceChildren();
    const values =
      activeAction === "suggestions" ? parseSuggestions(text) : [text.trim()];
    selectedResult = values[0] ?? "";
    for (const [index, value] of values.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-option";
      button.setAttribute("aria-pressed", String(index === 0));
      button.textContent = value;
      button.addEventListener("click", () => {
        selectedResult = value;
        for (const option of result.querySelectorAll<HTMLButtonElement>(
          "button",
        )) {
          option.setAttribute("aria-pressed", String(option === button));
        }
      });
      result.append(button);
    }
    resultWrap.hidden = false;
  };

  const generate = async (): Promise<void> => {
    const text = source.value.trim();
    if (!text) {
      status.textContent = t("writing.noText");
      return;
    }
    const currentRequest = ++requestNumber;
    run.disabled = true;
    status.textContent = t("common.loading");
    resultWrap.hidden = true;
    try {
      const response = await runAssistant(assistant, {
        kind: "writing",
        text,
        instruction: prompt.value.trim(),
        service: config.aiWriting.service ?? config.service,
        from: config.sourceLanguage,
        to: config.aiWriting.targetLanguage ?? config.targetLanguage,
      });
      if (currentRequest !== requestNumber) return;
      renderResults(response);
      status.textContent = "";
    } catch {
      if (currentRequest === requestNumber)
        status.textContent = t("common.failed");
    } finally {
      if (currentRequest === requestNumber) run.disabled = false;
    }
  };

  const close = (): void => {
    requestNumber += 1;
    document.removeEventListener("keydown", onKeyDown, true);
    host.remove();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close();
  };

  shadow.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.command === "close") close();
    if (target.dataset.command === "run") void generate();
    if (target.dataset.command === "insert" && captured && selectedResult) {
      replaceCapturedInput(captured.saved, selectedResult);
      close();
    }
    if (target.dataset.command === "copy" && selectedResult) {
      void copyText(selectedResult).then(() => {
        status.textContent = t("writing.copied");
      });
    }
  });
  shadow
    .querySelector(".backdrop")!
    .addEventListener("pointerdown", (event) => {
      if (event.target === event.currentTarget) close();
    });
  document.addEventListener("keydown", onKeyDown, true);
  document.documentElement.append(host);
  source.focus();
  return close;
}

function captureInput(): { text: string; saved: SavedInput } | undefined {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? start;
    const hasSelection = end > start;
    return {
      text: hasSelection ? active.value.slice(start, end) : active.value,
      saved: {
        field: active,
        start: hasSelection ? start : 0,
        end: hasSelection ? end : active.value.length,
      },
    };
  }
  if (active instanceof HTMLElement && active.isContentEditable) {
    const selection = window.getSelection();
    const selectedRange =
      selection?.rangeCount && active.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : undefined;
    return {
      text: selectedRange?.toString().trim() || active.textContent || "",
      saved: {
        field: active,
        start: 0,
        end: 0,
        range: selectedRange,
      },
    };
  }
  return undefined;
}

function replaceCapturedInput(saved: SavedInput, text: string): void {
  const { field } = saved;
  field.focus();
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    field.setRangeText(text, saved.start, saved.end, "end");
  } else {
    const range = saved.range ?? document.createRange();
    if (!saved.range) range.selectNodeContents(field);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
  }
  field.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
}

export function parseSuggestions(text: string): string[] {
  try {
    const parsed: unknown = JSON.parse(
      text.replace(/^```json\s*|\s*```$/g, ""),
    );
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .slice(0, 3);
    }
  } catch {
    // Numbered or newline-delimited output is also accepted.
  }
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const modalStyles = `
  :host { color-scheme: light; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .backdrop { display:grid; place-items:center; width:100%; height:100%; padding:20px; background:rgb(15 23 42 / 45%); }
  .modal { display:grid; gap:12px; width:min(680px, 96vw); max-height:90vh; overflow:auto; padding:18px; border-radius:12px; color:#111827; background:#fff; box-shadow:0 24px 70px rgb(0 0 0 / 30%); }
  header, footer, .actions { display:flex; align-items:center; gap:8px; }
  header { justify-content:space-between; }
  h2, h3 { margin:0; }
  button, textarea { font:inherit; }
  button { border:1px solid #d1d5db; border-radius:7px; padding:7px 10px; color:#111827; background:#f9fafb; cursor:pointer; }
  button[aria-selected=true], button[aria-pressed=true], .run { border-color:#2563eb; color:#fff; background:#2563eb; }
  button:disabled { opacity:.55; cursor:default; }
  .close { border:0; font-size:20px; background:transparent; }
  .field { display:grid; gap:5px; color:#4b5563; }
  textarea { width:100%; min-height:74px; padding:9px; border:1px solid #d1d5db; border-radius:7px; color:#111827; background:#fff; resize:vertical; }
  .source { min-height:100px; }
  .actions { flex-wrap:wrap; }
  .status { min-height:20px; margin:0; color:#6b7280; }
  .result-wrap { display:grid; gap:8px; }
  .result { display:grid; gap:7px; }
  .result-option { width:100%; text-align:left; white-space:pre-wrap; }
  footer { justify-content:flex-end; }
`;
