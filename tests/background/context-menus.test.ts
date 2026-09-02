import { describe, expect, it, vi } from "vitest";

import {
  CONTEXT_MENU_IDS,
  createContextMenus,
  routeContextMenuClick,
  type ContextMenuDependencies,
  type ContextMenusApi,
} from "../../src/background/context-menus";

function dependencies(): ContextMenuDependencies {
  return {
    sendControllerCommand: vi.fn().mockResolvedValue(undefined),
    sendTabMessage: vi.fn().mockResolvedValue(undefined),
    openExtensionPage: vi.fn().mockResolvedValue(undefined),
    openSidePanel: vi.fn().mockResolvedValue(undefined),
  };
}

describe("context menus", () => {
  it("recreates all five entries for install and update setup", async () => {
    const api: ContextMenusApi = {
      removeAll: vi.fn(),
      create: vi.fn(),
    };

    await createContextMenus(api);

    expect(api.removeAll).toHaveBeenCalledOnce();
    expect(api.create).toHaveBeenCalledTimes(5);
    expect(api.create).toHaveBeenCalledWith({
      id: CONTEXT_MENU_IDS.translateSelection,
      title: "翻译选中文本",
      contexts: ["selection"],
    });
  });

  it("routes every entry to the tab controller or destination", async () => {
    const target = dependencies();
    const tab = { id: 42 };

    await routeContextMenuClick(
      { menuItemId: CONTEXT_MENU_IDS.translatePage },
      tab,
      target,
    );
    await routeContextMenuClick(
      {
        menuItemId: CONTEXT_MENU_IDS.translateSelection,
        selectionText: "  selected text  ",
      },
      tab,
      target,
    );
    await routeContextMenuClick(
      { menuItemId: CONTEXT_MENU_IDS.translatePdf },
      tab,
      target,
    );
    await routeContextMenuClick(
      { menuItemId: CONTEXT_MENU_IDS.translateSubtitle },
      tab,
      target,
    );
    await routeContextMenuClick(
      { menuItemId: CONTEXT_MENU_IDS.openSidePanel },
      tab,
      target,
    );

    expect(target.sendControllerCommand).toHaveBeenCalledWith(
      42,
      "toggleTranslateTheWholePage",
    );
    expect(target.sendTabMessage).toHaveBeenCalledWith(42, {
      type: "translateSelection",
      tabId: 42,
      text: "selected text",
    });
    expect(target.openExtensionPage).toHaveBeenNthCalledWith(
      1,
      "src/pdf/index.html",
    );
    expect(target.openExtensionPage).toHaveBeenNthCalledWith(
      2,
      "src/subtitle-file/index.html",
    );
    expect(target.openSidePanel).toHaveBeenCalledWith(42);
  });
});
