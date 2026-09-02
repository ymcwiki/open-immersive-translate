import { describe, expect, it, vi } from "vitest";

import {
  COMMAND_ROUTES,
  EXTENSION_COMMAND_IDS,
  routeExtensionCommand,
  type CommandRouterDependencies,
} from "../../src/background/commands";
import manifest from "../../src/manifest";

function dependencies(): CommandRouterDependencies {
  return {
    getActiveTabId: vi.fn().mockResolvedValue(42),
    sendControllerCommand: vi.fn().mockResolvedValue(undefined),
    sendTabMessage: vi.fn().mockResolvedValue(undefined),
    openSidePanel: vi.fn().mockResolvedValue(undefined),
  };
}

describe("manifest command routing", () => {
  it("has an explicit route for every manifest command", () => {
    expect(Object.keys(COMMAND_ROUTES).sort()).toEqual(
      [...EXTENSION_COMMAND_IDS].sort(),
    );
    const manifestCommands = (
      manifest as unknown as { commands?: Record<string, unknown> }
    ).commands;
    expect(Object.keys(manifestCommands ?? {}).sort()).toEqual(
      [...EXTENSION_COMMAND_IDS].sort(),
    );
  });

  it.each([
    "toggleOnlyTranslation",
    "toggleTranslateToThePageEndImmediately",
    "toggleTranslationMask",
    "toggleMouseHoverTranslateDirectly",
    "toggleVideoSubtitlePreTranslation",
  ] as const)("routes %s to the active tab controller", async (command) => {
    const target = dependencies();

    await expect(routeExtensionCommand(command, target)).resolves.toBe(true);

    expect(target.sendControllerCommand).toHaveBeenCalledWith(42, command);
  });

  it("routes the side panel, input box, and AI writing feature commands", async () => {
    const target = dependencies();

    await routeExtensionCommand("toggleSidePanel", target);
    await routeExtensionCommand("translateInputBox", target);
    await routeExtensionCommand("openAiWritingModal", target);

    expect(target.openSidePanel).toHaveBeenCalledWith(42);
    expect(target.sendTabMessage).toHaveBeenCalledWith(42, {
      type: "translateInput",
      tabId: 42,
    });
    expect(target.sendTabMessage).toHaveBeenCalledWith(42, {
      type: "openAiWriting",
    });
  });
});
