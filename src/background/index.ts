import browser from "webextension-polyfill";

import { loadConfig, saveConfig } from "../shared/config";
import {
  onTranslatePort,
  sendToTab,
  type BackgroundRequest,
  type Msg,
} from "../shared/messages";
import { matchRule } from "./rules/match";

const notImplemented = {
  code: "NOT_IMPLEMENTED",
  message: "Translation scheduling is not implemented in phase 0.",
  retryable: false,
} as const;

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return undefined;
  }

  const request = message as BackgroundRequest;

  switch (request.type) {
    case "getRule":
      return Promise.resolve(matchRule(request.url));
    case "getConfig":
      return loadConfig();
    case "setConfig":
      return saveConfig(request.patch);
    case "translate":
      return Promise.resolve({ accepted: false, error: notImplemented });
    case "cancel":
      return Promise.resolve({ cancelled: true });
    default:
      return undefined;
  }
});

onTranslatePort((port) => {
  port.onMessage((message) => {
    if (message.type !== "translate") return;
    port.postMessage({
      type: "translateResult",
      requestId: message.requestId,
      results: message.paragraphs.map(({ id }) => ({
        id,
        error: notImplemented,
      })),
      done: true,
    });
  });
});

browser.commands.onCommand.addListener((command) => {
  void browser.tabs
    .query({ active: true, currentWindow: true })
    .then(async ([tab]) => {
      if (tab?.id === undefined) return;

      let message: Msg | undefined;
      if (command === "toggle-translate") {
        message = { type: "toggleTranslate", tabId: tab.id, scope: "main" };
      } else if (command === "toggle-whole-page") {
        message = { type: "toggleTranslate", tabId: tab.id, scope: "whole" };
      } else if (command === "translate-input") {
        message = { type: "translateInput", tabId: tab.id };
      }

      if (
        message?.type === "toggleTranslate" ||
        message?.type === "translateInput"
      ) {
        await sendToTab(tab.id, message);
      }
    })
    .catch((error: unknown) => {
      console.debug("[imt] Command could not reach the active tab", error);
    });
});
