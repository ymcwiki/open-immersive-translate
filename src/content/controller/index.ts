import browser from "webextension-polyfill";

import type {
  ControllerCommandMessage,
  PageCommandId,
  PageTranslationState,
  PageTranslationStateMessage,
} from "../../shared/j-types";
import { detectLang } from "../../shared/lang";
import { sendToBackground, type Msg } from "../../shared/messages";
import type { Config } from "../../shared/types";
import type { FeatureContext } from "../features/context";
import { init as initFloatBall } from "../features/float-ball";
import { init as initHoverTranslation } from "../features/hover-translate";
import { init as initInputTranslation } from "../features/input-translate";
import { init as initSelectionTranslation } from "../features/selection-translate";
import { init as initAiWriting } from "../features/ai-writing";
import { init as initSearchEnhancement } from "../features/search-enhancement";
import { initSubtitles } from "../features/subtitle";
import { onUrlChange } from "../observe/url-change";
import { isPageCommandId, runPageCommand } from "./commands";
import { createFrameSync, frameHasEnoughText } from "./frame-sync";
import { controllerT } from "./i18n";
import { mergePageStates } from "./page-state";
import { TranslationController } from "./translation-controller";

export { TranslationController } from "./translation-controller";
export * from "./commands";

export interface ImtPhase3DebugState {
  readonly version: "phase3";
  ready: boolean;
  active: boolean;
  config?: Config;
  error?: unknown;
}

declare global {
  interface Window {
    __imt: ImtPhase3DebugState;
  }
}

function showSelectionTranslation(
  controller: TranslationController,
  text: string,
): void {
  const handled = !document.dispatchEvent(
    new CustomEvent("imt:translate-selection", {
      cancelable: true,
      detail: { text },
    }),
  );
  if (handled) return;
  document.querySelector('[data-imt="context-menu"]')?.remove();
  const host = document.createElement("aside");
  host.dataset.imt = "context-menu";
  host.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:360px;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#111;box-shadow:0 8px 24px rgb(0 0 0 / 20%);font:14px/1.5 system-ui";
  host.textContent = controllerT("selectionTranslating");
  document.documentElement.append(host);
  void controller
    .translateText(
      text,
      controller.config.sourceLanguage,
      controller.config.targetLanguage,
    )
    .then((translation) => {
      if (host.isConnected) host.textContent = translation;
    })
    .catch(() => {
      if (host.isConnected) host.textContent = controllerT("translationFailed");
    });
}

/** Register the phase-3 page controller. The content entry calls this once. */
export async function init(): Promise<() => void> {
  const debugState: ImtPhase3DebugState = {
    version: "phase3",
    ready: false,
    active: false,
  };
  (window as unknown as { __imt: ImtPhase3DebugState }).__imt = debugState;

  let controller: TranslationController | undefined;
  let featureDisposers: Array<() => void> = [];
  let refreshQueue = Promise.resolve();
  let ownState: PageTranslationState = {
    status: "idle",
    total: 0,
    pending: 0,
    translated: 0,
    errors: 0,
  };
  const frameStates = new Map<string, PageTranslationState>();

  const sendState = (): void => {
    if (!frameSync.isTop) {
      frameSync.report(ownState);
      return;
    }
    const message: PageTranslationStateMessage = {
      type: "pageTranslationState",
      state: mergePageStates(ownState, frameStates.values()),
    };
    void browser.runtime.sendMessage(message).catch(() => undefined);
  };
  const runCommand = (command: PageCommandId): void => {
    if (!controller) return;
    runPageCommand(command, controller);
    debugState.active = controller.isTranslated();
  };
  const frameSync = createFrameSync(window, runCommand, (frameId, state) => {
    frameStates.set(frameId, state);
    sendState();
  });

  const mountFeatures = (current: TranslationController): void => {
    for (const dispose of featureDisposers) dispose();
    const context: FeatureContext = {
      get config() {
        return current.config;
      },
      get rule() {
        return current.rule;
      },
      translateText: (text, from, to) => current.translateText(text, from, to),
      translateParagraph: (container) => current.translateParagraph(container),
      toggleTranslate: () => current.toggleTranslate(),
      isTranslated: () => current.isTranslated(),
    };
    featureDisposers = [
      initFloatBall(context),
      initHoverTranslation(context),
      initSelectionTranslation(context),
      initInputTranslation(context),
      initAiWriting(context),
      initSearchEnhancement(context),
      initSubtitles(context),
    ];
  };

  const refresh = async (incomingConfig?: Config): Promise<void> => {
    const [config, rule] = await Promise.all([
      incomingConfig ?? sendToBackground({ type: "getConfig" }),
      sendToBackground({ type: "getRule", url: window.location.href }),
    ]);
    const minimum =
      (rule as { mainFrameMinTextCount?: number }).mainFrameMinTextCount ??
      (config as { mainFrameMinTextCount?: number }).mainFrameMinTextCount ??
      50;
    if (!frameSync.isTop && !frameHasEnoughText(document, minimum)) {
      controller?.destroy();
      controller = undefined;
      ownState = {
        status: "idle",
        total: 0,
        pending: 0,
        translated: 0,
        errors: 0,
      };
      sendState();
      debugState.ready = true;
      debugState.active = false;
      debugState.config = config;
      return;
    }
    if (!controller) {
      controller = new TranslationController(config, rule, {
        reportState(state) {
          ownState = state;
          debugState.active = state.status !== "idle";
          sendState();
        },
      });
    } else {
      controller.update(config, rule);
    }
    mountFeatures(controller);
    if (!controller.isTranslated() && controller.shouldAutoTranslate())
      controller.start();
    debugState.ready = true;
    debugState.error = undefined;
    debugState.config = config;
    debugState.active = controller.isTranslated();
  };

  const runtimeListener = (message: unknown): unknown => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message)
    ) {
      return undefined;
    }
    const type = (message as { type: unknown }).type;
    if (type === "pageControllerCommand") {
      const command = (message as ControllerCommandMessage).command;
      if (frameSync.isTop && isPageCommandId(command)) {
        runCommand(command);
        frameSync.broadcast(command);
      }
      return undefined;
    }

    const incoming = message as Msg;
    if (incoming.type === "getPageState") {
      return Promise.resolve({
        title: document.title,
        url: location.href,
        translated: controller?.isTranslated() ?? false,
        detectedLanguage: detectLang(
          document.body?.innerText.slice(0, 2_000) ?? "",
        ),
      });
    }
    if (incoming.type === "getSelectionText") {
      const active = document.activeElement;
      const text =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
          ? active.value.slice(
              active.selectionStart ?? 0,
              active.selectionEnd ?? 0,
            )
          : (window.getSelection()?.toString() ?? "");
      return Promise.resolve({ text: text.trim() });
    }
    if (incoming.type === "toggleTranslate" && frameSync.isTop) {
      const command =
        incoming.scope === "whole"
          ? "toggleTranslateTheWholePage"
          : "toggleTranslateTheMainPage";
      runCommand(command);
      frameSync.broadcast(command);
    } else if (incoming.type === "translateInput" && frameSync.isTop) {
      controller?.translateActiveInput();
    } else if (incoming.type === "translateSelection" && frameSync.isTop) {
      if (controller) showSelectionTranslation(controller, incoming.text);
    } else if (incoming.type === "configChanged") {
      refreshQueue = refreshQueue.then(() => refresh(incoming.config));
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(runtimeListener);
  const stopUrl = onUrlChange(() => {
    refreshQueue = refreshQueue.then(() => refresh());
  });

  try {
    await refresh();
  } catch (error) {
    debugState.error = error;
    console.error("[imt] Content initialization failed", error);
  }

  return () => {
    browser.runtime.onMessage.removeListener(runtimeListener);
    stopUrl();
    frameSync.dispose();
    controller?.destroy();
    for (const dispose of featureDisposers) dispose();
  };
}

/** Alias for hosts that use register naming. */
export const register = init;
