import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import browser from "webextension-polyfill";

import { LANGUAGE_CODES } from "../../shared/lang";
import { sendToTab } from "../../shared/messages";
import type { LangCode, TranslationMode } from "../../shared/types";
import { Button, Field, Select, Toggle } from "../shared/components";
import {
  languageName,
  serviceName,
  setUiLocaleOverride,
  t,
} from "../shared/i18n";
import { useKConfig } from "../shared/k-config";
import { clearCache } from "../shared/runtime";
import "../shared/styles.css";
import "./popup.css";

interface ActiveTab {
  id?: number;
  hostname?: string;
}

export function Popup(): preact.JSX.Element {
  const { config, error, updateConfig } = useKConfig();
  const [activeTab, setActiveTab] = useState<ActiveTab>({});
  const [translated, setTranslated] = useState(false);
  const [toggleError, setToggleError] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuStatus, setMenuStatus] = useState<string>();

  useEffect(() => {
    void getActiveTab().then(setActiveTab).catch(console.error);
  }, []);

  const languageOptions = useMemo(
    () =>
      LANGUAGE_CODES.filter((code) => code !== "auto").map((code) => ({
        value: code,
        label: languageName(code),
      })),
    [],
  );

  if (!config) {
    return (
      <main class="popup-shell">
        <p class={error ? "ui-status ui-status-error" : "ui-status"}>
          {error ? t("common.saveFailed") : t("common.loading")}
        </p>
      </main>
    );
  }

  setUiLocaleOverride(config.uiLanguage);

  const hostname = activeTab.hostname;
  const always = hostname
    ? config.alwaysTranslateSites.includes(hostname)
    : false;
  const never = hostname
    ? config.neverTranslateSites.includes(hostname)
    : false;
  const services = Object.keys(config.services).map((id) => ({
    value: id,
    label: serviceName(id),
  }));

  const togglePage = async (): Promise<void> => {
    if (activeTab.id === undefined) {
      setToggleError(true);
      return;
    }
    try {
      await sendToTab(activeTab.id, {
        type: "toggleTranslate",
        tabId: activeTab.id,
      });
      setTranslated((value) => !value);
      setToggleError(false);
    } catch {
      setToggleError(true);
    }
  };

  const setSiteRule = (kind: "always" | "never", checked: boolean): void => {
    if (!hostname) return;
    void updateConfig((current) => {
      const withoutHost = (sites: string[]) =>
        sites.filter((site) => site !== hostname);
      return kind === "always"
        ? {
            alwaysTranslateSites: checked
              ? [...withoutHost(current.alwaysTranslateSites), hostname]
              : withoutHost(current.alwaysTranslateSites),
            neverTranslateSites: withoutHost(current.neverTranslateSites),
          }
        : {
            neverTranslateSites: checked
              ? [...withoutHost(current.neverTranslateSites), hostname]
              : withoutHost(current.neverTranslateSites),
            alwaysTranslateSites: withoutHost(current.alwaysTranslateSites),
          };
    }).catch(console.error);
  };

  return (
    <main class="popup-shell">
      <header class="popup-header">
        <h1>{t("app.name")}</h1>
        {hostname && <span>{hostname}</span>}
      </header>

      <Button
        variant="primary"
        class="popup-toggle-button"
        onClick={() => void togglePage()}
      >
        {translated ? t("popup.showOriginal") : t("popup.translate")}
      </Button>
      {toggleError && (
        <p role="alert" class="ui-status ui-status-error">
          {t("popup.toggleFailed")}
        </p>
      )}

      <div class="popup-fields">
        <Field label={t("popup.service")} htmlFor="popup-service">
          <Select
            id="popup-service"
            value={config.service}
            options={services}
            onChange={(service) => {
              void updateConfig({ service }).catch(console.error);
            }}
          />
        </Field>
        <Field label={t("popup.targetLanguage")} htmlFor="popup-target">
          <Select
            id="popup-target"
            value={config.targetLanguage}
            options={languageOptions}
            onChange={(targetLanguage) => {
              void updateConfig({
                targetLanguage: targetLanguage as LangCode,
              }).catch(console.error);
            }}
          />
        </Field>
      </div>

      <section class="popup-section">
        <h2>{t("popup.mode")}</h2>
        <div class="segmented" role="group" aria-label={t("popup.mode")}>
          {(["dual", "translation"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={config.translationMode === mode}
              onClick={() => {
                void updateConfig({
                  translationMode: mode as TranslationMode,
                }).catch(console.error);
              }}
            >
              {t(mode === "dual" ? "mode.dual" : "mode.translation")}
            </button>
          ))}
        </div>
      </section>

      <section class="popup-section popup-site">
        <h2>{t("popup.currentSite")}</h2>
        {hostname ? (
          <>
            <Toggle
              checked={always}
              label={t("popup.alwaysTranslate")}
              onChange={(checked) => setSiteRule("always", checked)}
            />
            <Toggle
              checked={never}
              label={t("popup.neverTranslate")}
              onChange={(checked) => setSiteRule("never", checked)}
            />
          </>
        ) : (
          <p class="ui-status">{t("popup.noSite")}</p>
        )}
      </section>

      {error && (
        <p role="alert" class="ui-status ui-status-error">
          {t("common.saveFailed")}
        </p>
      )}

      <footer class="popup-footer">
        <div class="popup-more">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            {t("popup.more")}
          </button>
          {moreOpen && (
            <div class="popup-more-menu" role="menu">
              <MenuButton
                label={t("popup.settings")}
                onClick={() => void browser.runtime.openOptionsPage()}
              />
              <MenuButton
                label={t("popup.shortcuts")}
                onClick={() =>
                  void browser.tabs.create({
                    url: "chrome://extensions/shortcuts",
                  })
                }
              />
              <MenuButton
                label={t("popup.clearCache")}
                onClick={() => {
                  void clearCache()
                    .then((count) =>
                      setMenuStatus(
                        count === undefined
                          ? t("data.cacheClearFailed")
                          : t("popup.cacheCleared", { count }),
                      ),
                    )
                    .catch(() => setMenuStatus(t("data.cacheClearFailed")));
                }}
              />
              <MenuButton
                label={t("popup.feedback")}
                onClick={() =>
                  void browser.tabs.create({
                    url: "https://github.com/example/bilingual-translator/issues",
                  })
                }
              />
              <MenuButton
                label={t("popup.openSidePanel")}
                onClick={() => void openSidePanel(activeTab.id)}
              />
              <MenuButton
                label={t("popup.translatePdf")}
                onClick={() => void openExtensionPage("src/pdf/index.html")}
              />
              <MenuButton
                label={t("popup.translateSubtitle")}
                onClick={() =>
                  void openExtensionPage("src/subtitle-file/index.html")
                }
              />
            </div>
          )}
        </div>
        <span>
          {t("popup.shortcut", {
            shortcut:
              config.shortcuts["toggle-translate"] || t("shortcuts.unknown"),
          })}
        </span>
      </footer>
      {menuStatus && (
        <p role="status" class="ui-status">
          {menuStatus}
        </p>
      )}
    </main>
  );
}

function MenuButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): preact.JSX.Element {
  return (
    <button type="button" role="menuitem" onClick={onClick}>
      {label}
    </button>
  );
}

async function openExtensionPage(path: string): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL(path) });
}

async function openSidePanel(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  const sidePanel = (
    globalThis as unknown as {
      chrome?: {
        sidePanel?: { open(options: { tabId: number }): Promise<void> };
      };
    }
  ).chrome?.sidePanel;
  if (sidePanel) {
    await sidePanel.open({ tabId });
    return;
  }
  await browser.runtime.sendMessage({ type: "openSidePanel", tabId });
}

async function getActiveTab(): Promise<ActiveTab> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return {};

  let hostname: string | undefined;
  if (tab.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        hostname = url.hostname;
      }
    } catch {
      hostname = undefined;
    }
  }
  return { id: tab.id, hostname };
}

const root = document.getElementById("app");
if (root) render(<Popup />, root);
