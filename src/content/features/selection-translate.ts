import {
  createAssistantClient,
  runAssistant,
  type AssistantClient,
} from "../../shared/k-assistant";
import { withKDefaults } from "../../shared/k-types";
import type { LangCode } from "../../shared/types";
import { setUiLocaleOverride, t } from "../../ui/shared/i18n";
import type { FeatureContext } from "./context";

interface SelectionPosition {
  left: number;
  top: number;
}

export interface DictionaryPart {
  partOfSpeech: string;
  definitions: string[];
  examples: string[];
}

export interface DictionaryResult {
  word: string;
  phonetic?: string;
  parts: DictionaryPart[];
}

export interface SelectionOptions {
  assistant?: AssistantClient;
  speech?: SpeechSynthesis;
}

export const DICTIONARY_PROMPT = `Return strict JSON for the selected word using this shape: {"word":"","phonetic":"","parts":[{"partOfSpeech":"","definitions":[""],"examples":[""]}]}. Explain definitions in the target language. Do not add markdown.`;

function isEditable(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(
    element?.closest(
      "input, textarea, [contenteditable]:not([contenteditable='false'])",
    ),
  );
}

function selectionPosition(
  selection: Selection,
  event: MouseEvent,
): SelectionPosition {
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const left = rect.width || rect.height ? rect.right : event.clientX;
  const top = rect.width || rect.height ? rect.bottom : event.clientY;
  return {
    left: Math.max(8, Math.min(window.innerWidth - 40, left + 6)),
    top: Math.max(8, Math.min(window.innerHeight - 40, top + 6)),
  };
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.dataset.imt = "selection-copy";
  textarea.value = text;
  textarea.style.cssText = "position:fixed;left:-10000px;top:0";
  document.body.append(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

/** Install selection translation and its isolated mini panel. */
export function init(
  ctx: FeatureContext,
  options: SelectionOptions = {},
): () => void {
  const config = withKDefaults(ctx.config);
  setUiLocaleOverride(config.uiLanguage);
  if (
    !config.selection.enabled ||
    !matchesSite(location.href, config.selection.enabledPatterns)
  ) {
    return () => undefined;
  }

  const assistant = options.assistant ?? createAssistantClient();
  const speech = options.speech ?? globalThis.speechSynthesis;

  let host: HTMLDivElement | null = null;
  let requestNumber = 0;

  const close = (): void => {
    requestNumber += 1;
    host?.remove();
    host = null;
  };

  const showIcon = (text: string, position: SelectionPosition): void => {
    close();
    const selectionHost = document.createElement("div");
    selectionHost.dataset.imt = "selection";
    selectionHost.style.cssText = [
      "position:fixed",
      `left:${position.left}px`,
      `top:${position.top}px`,
      "z-index:2147483647",
    ].join(";");

    const shadow = selectionHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: light; font-family: system-ui, sans-serif; }
        button { font: inherit; }
        .trigger {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 50%;
          color: white;
          background: #2563eb;
          box-shadow: 0 3px 10px rgb(0 0 0 / 25%);
          cursor: pointer;
          padding: 0;
        }
        .panel {
          width: min(320px, calc(100vw - 24px));
          border: 1px solid rgb(0 0 0 / 10%);
          border-radius: 10px;
          padding: 12px;
          color: #111827;
          background: white;
          box-shadow: 0 8px 24px rgb(0 0 0 / 22%);
          font-size: 14px;
          line-height: 1.5;
        }
        .panel[hidden], .trigger[hidden] { display: none; }
        .result { margin: 0 0 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .actions { display: flex; justify-content: flex-end; gap: 6px; }
        .actions button {
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 4px 8px;
          color: #111827;
          background: #f9fafb;
          cursor: pointer;
        }
      </style>
      <button class="trigger" type="button" title="${t("selection.translate")}" aria-label="${t("selection.translate")}">译</button>
      <section class="panel" aria-live="polite" hidden>
        <div class="result"></div>
        <div class="actions">
          <button type="button" data-action="read">${t("selection.read")}</button>
          <button type="button" data-action="copy">${t("common.copy")}</button>
          <button type="button" data-action="close">${t("common.close")}</button>
        </div>
      </section>
    `;

    const trigger = shadow.querySelector<HTMLButtonElement>(".trigger")!;
    const panel = shadow.querySelector<HTMLElement>(".panel")!;
    const result = shadow.querySelector<HTMLElement>(".result")!;
    host = selectionHost;
    document.documentElement.append(selectionHost);

    trigger.addEventListener("pointerdown", (event) => event.preventDefault());
    const translate = (): void => {
      if (!panel.hidden) return;
      trigger.hidden = true;
      panel.hidden = false;
      result.textContent = t("selection.translating");
      const currentRequest = ++requestNumber;
      const request =
        config.selection.dictionary && isSingleWord(text)
          ? runAssistant(assistant, {
              kind: "dictionary",
              text,
              instruction: DICTIONARY_PROMPT,
              service: config.service,
              from: config.sourceLanguage,
              to: config.targetLanguage,
            })
          : ctx.translateText(
              text,
              config.sourceLanguage,
              config.targetLanguage,
            );
      void request
        .then((translation) => {
          if (host === selectionHost && requestNumber === currentRequest) {
            const dictionary =
              config.selection.dictionary && isSingleWord(text)
                ? parseDictionaryResponse(translation)
                : undefined;
            if (dictionary) renderDictionary(result, dictionary);
            else result.textContent = translation;
            if (config.selection.autoRead) {
              speakText(
                text,
                config.sourceLanguage,
                config.selection.voiceByLanguage,
                speech,
              );
            }
          }
        })
        .catch(() => {
          if (host === selectionHost && requestNumber === currentRequest) {
            result.textContent = t("selection.failed");
          }
        });
    };

    trigger.addEventListener("click", translate);
    if (config.selection.triggerMode === "icon-hover") {
      trigger.addEventListener("pointerenter", translate);
    } else if (config.selection.triggerMode === "direct") {
      translate();
    }

    shadow.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.dataset.action === "close") close();
      if (target.dataset.action === "copy") {
        const translation = result.textContent ?? "";
        void copyText(translation).catch(() => undefined);
      }
      if (target.dataset.action === "read") {
        speakText(
          text,
          config.sourceLanguage,
          config.selection.voiceByLanguage,
          speech,
        );
      }
    });
  };

  const onMouseUp = (event: MouseEvent): void => {
    const eventTarget = event.target;
    if (
      !(eventTarget instanceof Node) ||
      isEditable(eventTarget) ||
      (eventTarget instanceof Element && eventTarget.closest("[data-imt]"))
    ) {
      return;
    }

    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !text ||
      isEditable(selection.anchorNode) ||
      isEditable(selection.focusNode)
    ) {
      close();
      return;
    }

    showIcon(text, selectionPosition(selection, event));
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (host && !event.composedPath().includes(host)) close();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close();
  };

  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    close();
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}

export function isSingleWord(text: string): boolean {
  return /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u.test(text.trim());
}

export function parseDictionaryResponse(
  response: string,
): DictionaryResult | undefined {
  try {
    const value: unknown = JSON.parse(
      response.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""),
    );
    if (!isRecord(value) || typeof value.word !== "string") return undefined;
    const rawParts = Array.isArray(value.parts) ? value.parts : [];
    const parts = rawParts.flatMap((part) => {
      if (!isRecord(part) || typeof part.partOfSpeech !== "string") return [];
      return [
        {
          partOfSpeech: part.partOfSpeech,
          definitions: stringList(part.definitions),
          examples: stringList(part.examples),
        },
      ];
    });
    if (!parts.length) return undefined;
    return {
      word: value.word,
      phonetic: typeof value.phonetic === "string" ? value.phonetic : undefined,
      parts,
    };
  } catch {
    return undefined;
  }
}

function renderDictionary(
  container: HTMLElement,
  dictionary: DictionaryResult,
): void {
  container.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = dictionary.word;
  container.append(heading);
  if (dictionary.phonetic) {
    const phonetic = document.createElement("p");
    phonetic.textContent = `${t("selection.phonetic")}：${dictionary.phonetic}`;
    container.append(phonetic);
  }
  for (const part of dictionary.parts) {
    const section = document.createElement("section");
    const label = document.createElement("b");
    label.textContent = part.partOfSpeech;
    section.append(label);
    if (part.definitions.length) {
      const definitions = document.createElement("ul");
      for (const definition of part.definitions) {
        const item = document.createElement("li");
        item.textContent = definition;
        definitions.append(item);
      }
      section.append(definitions);
    }
    for (const example of part.examples) {
      const item = document.createElement("p");
      item.textContent = `${t("selection.example")}：${example}`;
      section.append(item);
    }
    container.append(section);
  }
}

export function selectVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
  preferredName?: string,
): SpeechSynthesisVoice | undefined {
  if (preferredName) {
    const preferred = voices.find((voice) => voice.name === preferredName);
    if (preferred) return preferred;
  }
  const normalized = language.toLowerCase();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalized) ??
    voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(normalized.split("-")[0]!),
    ) ??
    voices.find((voice) => voice.default) ??
    voices[0]
  );
}

export function speakText(
  text: string,
  language: LangCode,
  voiceByLanguage: Readonly<Record<string, string>>,
  speech: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): void {
  if (!speech || typeof SpeechSynthesisUtterance === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang =
    language === "auto" ? document.documentElement.lang : language;
  const voice = selectVoice(
    speech.getVoices(),
    utterance.lang,
    voiceByLanguage[language],
  );
  if (voice) utterance.voice = voice;
  speech.cancel();
  speech.speak(utterance);
}

export function matchesSite(url: string, patterns: readonly string[]): boolean {
  if (!patterns.length || patterns.includes("<all_urls>")) return true;
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Tests and user-entered hostnames can be matched directly.
  }
  return patterns.some((pattern) => {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*");
    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(url) || regex.test(hostname);
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
