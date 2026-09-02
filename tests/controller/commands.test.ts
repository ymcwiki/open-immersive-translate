import { describe, expect, it, vi } from "vitest";

import { runPageCommand, type PageControllerActions } from "../../src/content/controller/commands";
import { PAGE_COMMAND_IDS } from "../../src/shared/j-types";

function actions(): PageControllerActions {
  return {
    togglePage: vi.fn(),
    toggleWholePage: vi.fn(),
    toggleMainPage: vi.fn(),
    toggleOnlyTranslation: vi.fn(),
    togglePageEndImmediately: vi.fn(),
    toggleMask: vi.fn(),
    toggleHoverDirectly: vi.fn(),
    toggleVideoSubtitlePreTranslation: vi.fn(),
    translateWithService: vi.fn(),
  };
}

describe("page controller commands", () => {
  it("maps every declared command id", () => {
    const target = actions();
    for (const command of PAGE_COMMAND_IDS) runPageCommand(command, target);
    expect(target.togglePage).toHaveBeenCalledOnce();
    expect(target.toggleWholePage).toHaveBeenCalledOnce();
    expect(target.toggleMainPage).toHaveBeenCalledOnce();
    expect(target.toggleOnlyTranslation).toHaveBeenCalledOnce();
    expect(target.togglePageEndImmediately).toHaveBeenCalledOnce();
    expect(target.toggleMask).toHaveBeenCalledOnce();
    expect(target.toggleHoverDirectly).toHaveBeenCalledOnce();
    expect(target.toggleVideoSubtitlePreTranslation).toHaveBeenCalledOnce();
    expect(target.translateWithService).toHaveBeenCalledTimes(9);
    expect(target.translateWithService).toHaveBeenCalledWith("openai-compatible");
    expect(target.translateWithService).toHaveBeenCalledWith("custom3");
  });
});
