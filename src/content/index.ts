import browser from "webextension-polyfill";

import { sendToBackground, type Msg } from "../shared/messages";
import type { Config, Rule } from "../shared/types";

/** Read-only phase-0 state exposed for extension debugging. */
export interface ImtDebugState {
  readonly version: "phase0";
  readonly ready: boolean;
  readonly config?: Config;
  readonly rule?: Rule;
  readonly error?: unknown;
}

declare global {
  interface Window {
    __imt: ImtDebugState;
  }
}

const debugState: {
  version: "phase0";
  ready: boolean;
  config?: Config;
  rule?: Rule;
  error?: unknown;
} = {
  version: "phase0",
  ready: false,
};

window.__imt = debugState;

browser.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return undefined;
  }

  const incoming = message as Msg;
  if (
    incoming.type === "toggleTranslate" ||
    incoming.type === "translateInput" ||
    incoming.type === "configChanged"
  ) {
    console.debug("[imt] Phase 0 content message", incoming.type);
  }
  return undefined;
});

void Promise.all([
  sendToBackground({ type: "getRule", url: window.location.href }),
  sendToBackground({ type: "getConfig" }),
])
  .then(([rule, config]) => {
    debugState.rule = rule;
    debugState.config = config;
    debugState.ready = true;
    console.debug("[imt] Phase 0 ready", { rule, config });
  })
  .catch((error: unknown) => {
    debugState.error = error;
    console.debug("[imt] Phase 0 initialization failed", error);
  });

export {};
