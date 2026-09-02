import {
  PAGE_COMMAND_IDS,
  type PageCommandId,
} from "../../shared/j-types";

export interface PageControllerActions {
  togglePage(): void;
  toggleWholePage(): void;
  toggleMainPage(): void;
  toggleOnlyTranslation(): void;
  togglePageEndImmediately(): void;
  toggleMask(): void;
  toggleHoverDirectly(): void;
  toggleVideoSubtitlePreTranslation(): void;
  translateWithService(serviceId: string): void;
}

const SERVICE_COMMANDS: Readonly<Partial<Record<PageCommandId, string>>> = {
  translateWithGoogle: "google",
  translateWithBing: "bing",
  translateWithDeepL: "deepl",
  translateWithOpenAI: "openai-compatible",
  translateWithClaude: "claude",
  translateWithGemini: "gemini",
  translateWithCustom1: "custom1",
  translateWithCustom2: "custom2",
  translateWithCustom3: "custom3",
};

export function isPageCommandId(value: unknown): value is PageCommandId {
  return typeof value === "string" && PAGE_COMMAND_IDS.includes(value as PageCommandId);
}

/** Map every manifest page command to one controller action. */
export function runPageCommand(
  command: PageCommandId,
  actions: PageControllerActions,
): void {
  const service = SERVICE_COMMANDS[command];
  if (service) {
    actions.translateWithService(service);
    return;
  }
  switch (command) {
    case "toggleTranslatePage":
      actions.togglePage();
      break;
    case "toggleTranslateTheWholePage":
      actions.toggleWholePage();
      break;
    case "toggleTranslateTheMainPage":
      actions.toggleMainPage();
      break;
    case "toggleOnlyTranslation":
      actions.toggleOnlyTranslation();
      break;
    case "toggleTranslateToThePageEndImmediately":
      actions.togglePageEndImmediately();
      break;
    case "toggleTranslationMask":
      actions.toggleMask();
      break;
    case "toggleMouseHoverTranslateDirectly":
      actions.toggleHoverDirectly();
      break;
    case "toggleVideoSubtitlePreTranslation":
      actions.toggleVideoSubtitlePreTranslation();
      break;
  }
}
