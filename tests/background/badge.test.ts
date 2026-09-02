import { describe, expect, it, vi } from "vitest";

import {
  badgeForPageState,
  PageBadgeController,
  type BadgeActionApi,
} from "../../src/background/badge";
import type { PageTranslationState } from "../../src/shared/messages";

function state(status: PageTranslationState["status"]): PageTranslationState {
  return { status, total: 12, pending: 3, translated: 8, errors: 1 };
}

function actionMock(): BadgeActionApi {
  return {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setTitle: vi.fn(),
  };
}

describe("page action badge", () => {
  it.each([
    ["idle", "", "#64748b"],
    ["translating", "…", "#2563eb"],
    ["done", "✓", "#15803d"],
    ["error", "!", "#b42318"],
  ] as const)("maps %s state to its badge", (status, text, color) => {
    expect(badgeForPageState(state(status))).toEqual({
      text,
      color,
      title: "翻译 8/12，待处理 3，失败 1",
    });
  });

  it("stores a tab state and applies a content-controller message", async () => {
    const action = actionMock();
    const controller = new PageBadgeController(action);
    const current = state("translating");

    await expect(
      controller.handleMessage(
        { type: "pageTranslationState", state: current },
        { tab: { id: 42 } },
      ),
    ).resolves.toEqual({ received: true });

    expect(controller.get(42)).toEqual(current);
    expect(action.setBadgeText).toHaveBeenCalledWith({
      tabId: 42,
      text: "…",
    });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 42,
      color: "#2563eb",
    });
    expect(action.setTitle).toHaveBeenCalledWith({
      tabId: 42,
      title: "翻译 8/12，待处理 3，失败 1",
    });
  });

  it("clears stored state and badge text on navigation", async () => {
    const action = actionMock();
    const controller = new PageBadgeController(action);
    await controller.update(42, state("done"));

    await controller.clear(42);

    expect(controller.get(42)).toBeUndefined();
    expect(action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 42,
      text: "",
    });
  });
});
