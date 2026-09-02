import { PAGE_COMMAND_IDS, type PageCommandId } from "../shared/j-types";
import type { TabMessage } from "../shared/messages";

export const FEATURE_COMMAND_IDS = [
  "toggleSidePanel",
  "translateInputBox",
  "openAiWritingModal",
] as const;

export const EXTENSION_COMMAND_IDS = [
  ...PAGE_COMMAND_IDS,
  ...FEATURE_COMMAND_IDS,
] as const;

export type FeatureCommandId = (typeof FEATURE_COMMAND_IDS)[number];
export type ExtensionCommandId = (typeof EXTENSION_COMMAND_IDS)[number];

export type CommandRoute =
  | { kind: "controller"; command: PageCommandId }
  | { kind: "tab"; message: "translateInput" | "openAiWriting" }
  | { kind: "sidePanel" };

export const COMMAND_ROUTES: Readonly<
  Record<ExtensionCommandId, CommandRoute>
> = {
  toggleTranslatePage: {
    kind: "controller",
    command: "toggleTranslatePage",
  },
  toggleTranslateTheWholePage: {
    kind: "controller",
    command: "toggleTranslateTheWholePage",
  },
  toggleTranslateTheMainPage: {
    kind: "controller",
    command: "toggleTranslateTheMainPage",
  },
  toggleOnlyTranslation: {
    kind: "controller",
    command: "toggleOnlyTranslation",
  },
  toggleTranslateToThePageEndImmediately: {
    kind: "controller",
    command: "toggleTranslateToThePageEndImmediately",
  },
  toggleTranslationMask: {
    kind: "controller",
    command: "toggleTranslationMask",
  },
  toggleMouseHoverTranslateDirectly: {
    kind: "controller",
    command: "toggleMouseHoverTranslateDirectly",
  },
  toggleVideoSubtitlePreTranslation: {
    kind: "controller",
    command: "toggleVideoSubtitlePreTranslation",
  },
  translateWithGoogle: {
    kind: "controller",
    command: "translateWithGoogle",
  },
  translateWithBing: {
    kind: "controller",
    command: "translateWithBing",
  },
  translateWithDeepL: {
    kind: "controller",
    command: "translateWithDeepL",
  },
  translateWithOpenAI: {
    kind: "controller",
    command: "translateWithOpenAI",
  },
  translateWithClaude: {
    kind: "controller",
    command: "translateWithClaude",
  },
  translateWithGemini: {
    kind: "controller",
    command: "translateWithGemini",
  },
  translateWithCustom1: {
    kind: "controller",
    command: "translateWithCustom1",
  },
  translateWithCustom2: {
    kind: "controller",
    command: "translateWithCustom2",
  },
  translateWithCustom3: {
    kind: "controller",
    command: "translateWithCustom3",
  },
  toggleSidePanel: { kind: "sidePanel" },
  translateInputBox: { kind: "tab", message: "translateInput" },
  openAiWritingModal: { kind: "tab", message: "openAiWriting" },
};

export interface CommandRouterDependencies {
  getActiveTabId(): Promise<number | undefined>;
  sendControllerCommand(tabId: number, command: PageCommandId): Promise<void>;
  sendTabMessage(tabId: number, message: TabMessage): Promise<void>;
  openSidePanel(tabId: number): Promise<void>;
}

export function isExtensionCommandId(
  command: string,
): command is ExtensionCommandId {
  return EXTENSION_COMMAND_IDS.includes(command as ExtensionCommandId);
}

/** Route one manifest command to the active tab's controller or feature. */
export async function routeExtensionCommand(
  command: string,
  dependencies: CommandRouterDependencies,
): Promise<boolean> {
  if (!isExtensionCommandId(command)) return false;
  const tabId = await dependencies.getActiveTabId();
  if (tabId === undefined) return true;
  const route = COMMAND_ROUTES[command];
  if (route.kind === "controller") {
    await dependencies.sendControllerCommand(tabId, route.command);
  } else if (route.kind === "sidePanel") {
    await dependencies.openSidePanel(tabId);
  } else {
    const message: TabMessage =
      route.message === "translateInput"
        ? { type: "translateInput", tabId }
        : { type: "openAiWriting" };
    await dependencies.sendTabMessage(tabId, message);
  }
  return true;
}
