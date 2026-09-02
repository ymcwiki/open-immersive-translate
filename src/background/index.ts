import browser from "webextension-polyfill";

import {
  CONFIG_STORAGE_KEY,
  DEFAULT_CONFIG,
  loadConfig,
  onConfigChange,
  saveConfig,
} from "../shared/config";
import {
  onTranslatePort,
  sendToTab,
  type BackgroundRequest,
  type ServiceInfo,
  type ServiceTestResult,
  type TabMessage,
  type TranslateMessage,
} from "../shared/messages";
import type { Rule, ServiceConfig } from "../shared/types";
import {
  clearTranslationCache,
  cleanupTranslationCache,
  getTranslationCacheCount,
} from "./cache";
import { matchRule, validateRule } from "./rules/match";
import { cancel, cancelTab, translate } from "./scheduler";
import { createService, listServices } from "./services";
import { serializeTranslateError } from "./services/base";

const MENU_TRANSLATE_PAGE = "imt-translate-page";
const MENU_TRANSLATE_SELECTION = "imt-translate-selection";

async function configuredRule(url: string): Promise<Rule> {
  const config = await loadConfig();
  const displayRule: Rule = {
    matches: ["<all_urls>"],
    translationMode: config.translationMode,
    theme: config.theme,
  };
  return matchRule(url, [displayRule, ...config.userRules]);
}

async function serviceList(): Promise<ServiceInfo[]> {
  const config = await loadConfig();
  const builtins = new Map(
    listServices().map((service) => [service.id, service]),
  );

  return Object.entries(config.services).map(([id, serviceConfig]) => {
    const service = builtins.get(id) ?? createService(id, serviceConfig);
    return {
      id,
      name: service.name,
      kind: serviceConfig.kind,
      enabled: serviceConfig.enabled === true,
      placeholder: service.placeholder,
    };
  });
}

async function testService(
  serviceId: string,
  unsavedConfig?: ServiceConfig,
): Promise<ServiceTestResult> {
  try {
    const config = await loadConfig();
    const serviceConfig = unsavedConfig ?? config.services[serviceId];
    if (!serviceConfig) {
      return { ok: false, message: `未找到服务配置：${serviceId}` };
    }
    if (serviceConfig.enabled !== true) {
      return { ok: false, message: `服务未启用：${serviceId}` };
    }

    const service = createService(serviceId, serviceConfig);
    const result = await service.translate(
      {
        texts: ["Hello"],
        from: "en",
        to: config.targetLanguage === "en" ? "zh-CN" : config.targetLanguage,
      },
      new AbortController().signal,
    );
    const itemError = result.errors?.[0];
    if (itemError) return { ok: false, message: itemError.message };
    return result.texts[0]
      ? { ok: true, message: "连接成功" }
      : { ok: false, message: "服务返回了空译文" };
  } catch (error) {
    return {
      ok: false,
      message: serializeTranslateError(error, serviceId).message,
    };
  }
}

function runTranslation(request: TranslateMessage): void {
  void translate(request, (message) => {
    void sendToTab(request.tabId, message).catch(() => undefined);
  });
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return undefined;
  }

  const request = message as BackgroundRequest;
  switch (request.type) {
    case "getRule":
      return configuredRule(request.url);
    case "getConfig":
      return loadConfig();
    case "setConfig":
      return saveConfig(request.patch);
    case "translate":
      runTranslation(request);
      return Promise.resolve({ accepted: true });
    case "cancel":
      cancel(request.tabId, request.requestId);
      return Promise.resolve({ cancelled: true });
    case "getServices":
      return serviceList();
    case "testService":
      return testService(request.serviceId, request.config);
    case "getCacheStats":
      return getTranslationCacheCount().then((count) => ({ count }));
    case "clearCache":
      return getTranslationCacheCount().then(async (cleared) => {
        await clearTranslationCache();
        return { cleared };
      });
    case "validateRule":
      return Promise.resolve(validateRule(request.rule));
    case "openOptions":
      return browser.runtime.openOptionsPage().then(() => ({ opened: true }));
    default:
      return undefined;
  }
});

onTranslatePort((port) => {
  const tabId = port.sender?.tab?.id;
  if (tabId === undefined) {
    port.disconnect();
    return;
  }

  const requestIds = new Set<string>();
  let disconnected = false;
  port.onMessage((message) => {
    if (message.type === "cancel") {
      cancel(tabId, message.requestId);
      if (message.requestId) requestIds.delete(message.requestId);
      return;
    }

    const request: TranslateMessage = { ...message, tabId };
    requestIds.add(request.requestId);
    void translate(request, (response) => {
      if (response.done) requestIds.delete(request.requestId);
      if (!disconnected) port.postMessage(response);
    });
  });

  port.onDisconnect(() => {
    disconnected = true;
    for (const requestId of requestIds) cancel(tabId, requestId);
    requestIds.clear();
  });
});

async function sendToActiveTab(
  message: (tabId: number) => TabMessage,
): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  await sendToTab(tab.id, message(tab.id));
}

browser.commands.onCommand.addListener((command) => {
  let message: ((tabId: number) => TabMessage) | undefined;
  if (command === "toggle-translate") {
    message = (tabId) => ({ type: "toggleTranslate", tabId, scope: "main" });
  } else if (command === "toggle-whole-page") {
    message = (tabId) => ({ type: "toggleTranslate", tabId, scope: "whole" });
  } else if (command === "translate-input") {
    message = (tabId) => ({ type: "translateInput", tabId });
  }
  if (message) void sendToActiveTab(message).catch(() => undefined);
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  if (info.menuItemId === MENU_TRANSLATE_PAGE) {
    void sendToTab(tab.id, {
      type: "toggleTranslate",
      tabId: tab.id,
      scope: "whole",
    }).catch(() => undefined);
  } else if (
    info.menuItemId === MENU_TRANSLATE_SELECTION &&
    info.selectionText?.trim()
  ) {
    void sendToTab(tab.id, {
      type: "translateSelection",
      tabId: tab.id,
      text: info.selectionText.trim(),
    }).catch(() => undefined);
  }
});

browser.runtime.onInstalled.addListener(() => {
  void (async () => {
    const stored = await browser.storage.local.get(CONFIG_STORAGE_KEY);
    if (stored[CONFIG_STORAGE_KEY] === undefined) {
      await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: DEFAULT_CONFIG });
    }
    const config = await loadConfig();
    await cleanupTranslationCache(config.cache.maxAgeDays);
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: MENU_TRANSLATE_PAGE,
      title: "翻译网页",
      contexts: ["page"],
    });
    browser.contextMenus.create({
      id: MENU_TRANSLATE_SELECTION,
      title: "翻译选中文本",
      contexts: ["selection"],
    });
  })().catch((error: unknown) => {
    console.error("[imt] Installation setup failed", error);
  });
});

onConfigChange((config) => {
  void browser.tabs
    .query({})
    .then((tabs) =>
      Promise.all(
        tabs.map((tab) =>
          tab.id === undefined
            ? Promise.resolve()
            : sendToTab(tab.id, { type: "configChanged", config }).catch(
                () => undefined,
              ),
        ),
      ),
    );
});

browser.tabs.onRemoved.addListener((tabId) => cancelTab(tabId));
