import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import browser from "webextension-polyfill";

import {
  createAssistantClient,
  runAssistant,
  type AssistantChatMessage,
  type AssistantClient,
} from "../../shared/k-assistant";
import { LANGUAGE_CODES } from "../../shared/lang";
import type { LangCode, TranslationMode } from "../../shared/types";
import { Button, Field, Select } from "../shared/components";
import {
  languageName,
  serviceName,
  setUiLocaleOverride,
  t,
} from "../shared/i18n";
import { useKConfig } from "../shared/k-config";
import "../shared/styles.css";
import "./sidepanel.css";

const HISTORY_KEY = "kSidePanelHistory";

export interface TranslationHistoryItem {
  source: string;
  translation: string;
  from: LangCode;
  to: LangCode;
  service: string;
  createdAt: number;
}

interface PageState {
  title: string;
  url: string;
  translated: boolean;
  detectedLanguage?: string;
}

interface SidePanelProps {
  assistant?: AssistantClient;
}

type PanelTab = "translate" | "chat" | "page";

export function SidePanel({ assistant }: SidePanelProps): preact.JSX.Element {
  const client = useMemo(
    () => assistant ?? createAssistantClient(),
    [assistant],
  );
  const { config, error, updateConfig } = useKConfig();
  const [activeTab, setActiveTab] = useState<PanelTab>("translate");
  const [tabId, setTabId] = useState<number>();
  const [page, setPage] = useState<PageState>();
  const [source, setSource] = useState("");
  const [output, setOutput] = useState("");
  const [working, setWorking] = useState(false);
  const [history, setHistory] = useState<TranslationHistoryItem[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    void activeBrowserTab().then(async (tab) => {
      setTabId(tab.id);
      if (tab.id === undefined) return;
      setPage(await readPageState(tab.id, tab.title, tab.url));
    });
    void loadHistory().then((items) => {
      setHistory(items);
      setHistoryReady(true);
    });

    const listener = (message: unknown): void => {
      if (
        isRecord(message) &&
        message.type === "sidePanelSelection" &&
        typeof message.text === "string"
      ) {
        setSelectedText(message.text.trim());
        setActiveTab("chat");
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!historyReady || !config) return;
    void saveHistory(history.slice(0, config.sidePanel.historyLimit));
  }, [config, history, historyReady]);

  if (!config) {
    return (
      <main class="side-shell">
        <p class="ui-status">
          {error ? t("common.failed") : t("common.loading")}
        </p>
      </main>
    );
  }

  setUiLocaleOverride(config.uiLanguage);
  const service = config.sidePanel.service ?? config.service;
  const targetLanguage =
    config.sidePanel.targetLanguage ?? config.targetLanguage;
  const serviceOptions = Object.keys(config.services).map((id) => ({
    value: id,
    label: serviceName(id),
  }));
  const languageOptions = LANGUAGE_CODES.filter((code) => code !== "auto").map(
    (code) => ({ value: code, label: languageName(code) }),
  );

  const translate = async (): Promise<void> => {
    if (!source.trim() || working) return;
    setWorking(true);
    setStatus(undefined);
    setOutput("");
    try {
      const translation = await runAssistant(
        client,
        {
          kind: "translate",
          text: source.trim(),
          service,
          from: config.sourceLanguage,
          to: targetLanguage,
        },
        setOutput,
      );
      setOutput(translation);
      setHistory((items) => [
        {
          source: source.trim(),
          translation,
          from: config.sourceLanguage,
          to: targetLanguage,
          service,
          createdAt: Date.now(),
        },
        ...items,
      ]);
    } catch {
      setStatus(t("common.failed"));
    } finally {
      setWorking(false);
    }
  };

  const sendChat = async (rawText = chatInput): Promise<void> => {
    const text = rawText.trim();
    if (!text || working) return;
    const prior = [...messages, { role: "user", content: text } as const];
    setMessages([...prior, { role: "assistant", content: "" }]);
    setChatInput("");
    setWorking(true);
    setStatus(undefined);
    try {
      const response = await runAssistant(
        client,
        { kind: "chat", text, service, history: messages },
        (partial) =>
          setMessages([...prior, { role: "assistant", content: partial }]),
      );
      setMessages([...prior, { role: "assistant", content: response }]);
    } catch {
      setMessages(prior);
      setStatus(t("common.failed"));
    } finally {
      setWorking(false);
    }
  };

  const explainSelection = async (): Promise<void> => {
    let text = selectedText;
    if (!text && tabId !== undefined) text = await readSelection(tabId);
    if (!text) {
      setStatus(t("side.noSelection"));
      return;
    }
    setSelectedText(text);
    setActiveTab("chat");
    await sendChat(`请解释下面这段内容：\n\n${text}`);
  };

  const togglePage = async (): Promise<void> => {
    if (tabId === undefined || !page) return;
    await browser.tabs.sendMessage(tabId, {
      type: "toggleTranslate",
      tabId,
    });
    setPage({ ...page, translated: !page.translated });
  };

  return (
    <main class="side-shell">
      <header class="side-header">
        <h1>{t("app.name")}</h1>
        <Button variant="quiet" onClick={() => void explainSelection()}>
          {t("side.explainSelection")}
        </Button>
      </header>
      <nav class="side-tabs" role="tablist">
        {(["translate", "chat", "page"] as const).map((panel) => (
          <button
            key={panel}
            type="button"
            role="tab"
            aria-selected={activeTab === panel}
            onClick={() => setActiveTab(panel)}
          >
            {t(`side.${panel}`)}
          </button>
        ))}
      </nav>

      <div class="side-pickers">
        <Field label={t("popup.service")} htmlFor="side-service">
          <Select
            id="side-service"
            value={service}
            options={serviceOptions}
            onChange={(next) =>
              void updateConfig((current) => ({
                sidePanel: { ...current.sidePanel, service: next },
              }))
            }
          />
        </Field>
        {activeTab === "translate" && (
          <Field label={t("popup.targetLanguage")} htmlFor="side-language">
            <Select
              id="side-language"
              value={targetLanguage}
              options={languageOptions}
              onChange={(next) =>
                void updateConfig((current) => ({
                  sidePanel: {
                    ...current.sidePanel,
                    targetLanguage: next as LangCode,
                  },
                }))
              }
            />
          </Field>
        )}
      </div>

      {activeTab === "translate" && (
        <section class="side-panel" aria-label={t("side.translate")}>
          <textarea
            aria-label={t("side.sourceText")}
            placeholder={t("side.sourceText")}
            value={source}
            onInput={(event) => setSource(event.currentTarget.value)}
          />
          <Button
            variant="primary"
            disabled={working}
            onClick={() => void translate()}
          >
            {t("side.translateAction")}
          </Button>
          {output && (
            <pre class="side-output" aria-live="polite">
              {output}
            </pre>
          )}
          <h2>{t("side.history")}</h2>
          {history.length ? (
            <ol class="side-history">
              {history.slice(0, config.sidePanel.historyLimit).map((item) => (
                <li key={`${item.createdAt}-${item.source}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSource(item.source);
                      setOutput(item.translation);
                    }}
                  >
                    <strong>{item.source}</strong>
                    <span>{item.translation}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p class="ui-status">{t("side.noHistory")}</p>
          )}
        </section>
      )}

      {activeTab === "chat" && (
        <section class="side-panel side-chat" aria-label={t("side.chat")}>
          <div class="side-messages" aria-live="polite">
            {messages.map((message, index) => (
              <p
                key={`${message.role}-${index}`}
                class={`message-${message.role}`}
              >
                {message.content || t("common.loading")}
              </p>
            ))}
          </div>
          <textarea
            aria-label={t("side.ask")}
            placeholder={t("side.ask")}
            value={chatInput}
            onInput={(event) => setChatInput(event.currentTarget.value)}
          />
          <Button
            variant="primary"
            disabled={working}
            onClick={() => void sendChat()}
          >
            {t("side.send")}
          </Button>
        </section>
      )}

      {activeTab === "page" && (
        <section class="side-panel" aria-label={t("side.pageState")}>
          {page ? (
            <>
              <h2>{page.title || page.url}</h2>
              <p class="side-url">{page.url}</p>
              <p>
                {page.translated
                  ? t("side.pageTranslated")
                  : t("side.pageOriginal")}
              </p>
              {page.detectedLanguage && (
                <p>{languageName(page.detectedLanguage)}</p>
              )}
              <Button variant="primary" onClick={() => void togglePage()}>
                {page.translated ? t("side.untranslate") : t("popup.translate")}
              </Button>
              <Field label={t("popup.mode")} htmlFor="side-mode">
                <Select
                  id="side-mode"
                  value={config.translationMode}
                  options={[
                    { value: "dual", label: t("mode.dual") },
                    { value: "translation", label: t("mode.translation") },
                  ]}
                  onChange={(mode) =>
                    void updateConfig({
                      translationMode: mode as TranslationMode,
                    })
                  }
                />
              </Field>
            </>
          ) : (
            <p class="ui-status">{t("side.loadFailed")}</p>
          )}
        </section>
      )}

      {status && (
        <p role="status" class="ui-status ui-status-error">
          {status}
        </p>
      )}
    </main>
  );
}

async function activeBrowserTab(): Promise<{
  id?: number;
  title?: string;
  url?: string;
}> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return { id: tab?.id, title: tab?.title, url: tab?.url };
}

async function readPageState(
  tabId: number,
  title = "",
  url = "",
): Promise<PageState> {
  try {
    const response: unknown = await browser.tabs.sendMessage(tabId, {
      type: "getPageState",
    });
    if (isRecord(response)) {
      return {
        title: typeof response.title === "string" ? response.title : title,
        url: typeof response.url === "string" ? response.url : url,
        translated: response.translated === true,
        detectedLanguage:
          typeof response.detectedLanguage === "string"
            ? response.detectedLanguage
            : undefined,
      };
    }
  } catch {
    // Restricted pages still have useful tab metadata.
  }
  return { title, url, translated: false };
}

async function readSelection(tabId: number): Promise<string> {
  try {
    const response: unknown = await browser.tabs.sendMessage(tabId, {
      type: "getSelectionText",
    });
    return isRecord(response) && typeof response.text === "string"
      ? response.text.trim()
      : "";
  } catch {
    return "";
  }
}

export async function loadHistory(): Promise<TranslationHistoryItem[]> {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  const value = stored[HISTORY_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isHistoryItem);
}

export async function saveHistory(
  history: readonly TranslationHistoryItem[],
): Promise<void> {
  await browser.storage.local.set({ [HISTORY_KEY]: [...history] });
}

function isHistoryItem(value: unknown): value is TranslationHistoryItem {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    typeof value.translation === "string" &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    typeof value.service === "string" &&
    typeof value.createdAt === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const root = document.getElementById("app");
if (root) render(<SidePanel />, root);
