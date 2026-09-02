import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => {
  const messageListeners = new Set<(message: unknown) => void>();
  return {
    messageListeners,
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: (message: unknown) => void) =>
          messageListeners.add(listener),
        ),
        removeListener: vi.fn((listener: (message: unknown) => void) =>
          messageListeners.delete(listener),
        ),
      },
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
    storage: {
      local: { get: vi.fn(), set: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  };
});

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import { DEFAULT_CONFIG } from "../../src/shared/config";
import type { AssistantClient } from "../../src/shared/k-assistant";
import { withKDefaults } from "../../src/shared/k-types";
import { SidePanel } from "../../src/ui/sidepanel/index";

let storage: Record<string, unknown>;

beforeEach(() => {
  storage = { config: withKDefaults(DEFAULT_CONFIG), kSidePanelHistory: [] };
  browserMock.messageListeners.clear();
  browserMock.tabs.query
    .mockReset()
    .mockResolvedValue([
      { id: 8, title: "Article", url: "https://example.com/article" },
    ]);
  browserMock.tabs.sendMessage
    .mockReset()
    .mockImplementation(async (_id, message) => {
      if (message.type === "getPageState") {
        return {
          title: "Article",
          url: "https://example.com/article",
          translated: false,
        };
      }
      if (message.type === "getSelectionText")
        return { text: "selected sentence" };
      return undefined;
    });
  browserMock.storage.local.get.mockReset().mockImplementation(async (key) => ({
    [key]: storage[key],
  }));
  browserMock.storage.local.set
    .mockReset()
    .mockImplementation(async (value) => {
      Object.assign(storage, value);
    });
  browserMock.storage.onChanged.addListener.mockReset();
  browserMock.storage.onChanged.removeListener.mockReset();
});

afterEach(cleanup);

describe("SidePanel", () => {
  it("streams translation, stores history, chats about the page selection, and toggles the page", async () => {
    const assistant: AssistantClient = {
      complete: vi.fn().mockResolvedValue("fallback"),
      supportsStreaming: vi.fn().mockResolvedValue(true),
      stream: vi.fn().mockImplementation(async (request, onPartial) => {
        const response = request.kind === "translate" ? "你好" : "解释结果";
        onPartial(response.slice(0, 1));
        onPartial(response);
        return response;
      }),
    };
    render(<SidePanel assistant={assistant} />);

    const source = await screen.findByLabelText("输入要翻译的文字");
    fireEvent.input(source, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "翻译文字" }));
    await screen.findByText("你好");
    await waitFor(() =>
      expect(storage.kSidePanelHistory).toEqual([
        expect.objectContaining({ source: "hello", translation: "你好" }),
      ]),
    );

    fireEvent.click(screen.getByRole("button", { name: "解释这段" }));
    await screen.findByText("解释结果");
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(8, {
      type: "getSelectionText",
    });

    fireEvent.click(screen.getByRole("tab", { name: "页面" }));
    const translatePage = await screen.findByRole("button", { name: "翻译" });
    fireEvent.click(translatePage);
    await waitFor(() =>
      expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(8, {
        type: "toggleTranslate",
        tabId: 8,
      }),
    );
    expect(screen.getByRole("button", { name: "显示原文" })).toBeTruthy();
  });
});
