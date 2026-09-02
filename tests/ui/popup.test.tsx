import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  runtime: {
    openOptionsPage: vi.fn(),
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import { DEFAULT_CONFIG } from "../../src/shared/config";
import { Popup } from "../../src/ui/popup/index";
import type { Config } from "../../src/shared/types";

let stored: Config;

beforeEach(() => {
  stored = structuredClone(DEFAULT_CONFIG);
  browserMock.runtime.openOptionsPage.mockReset();
  browserMock.runtime.sendMessage
    .mockReset()
    .mockImplementation(async (message: { type?: string }) => {
      if (message.type === "getCacheStats") return { count: 4 };
      if (message.type === "clearCache") return { cleared: 4 };
      return undefined;
    });
  browserMock.runtime.getURL.mockClear();
  browserMock.tabs.query.mockReset();
  browserMock.tabs.sendMessage.mockReset();
  browserMock.tabs.create.mockReset().mockResolvedValue(undefined);
  browserMock.storage.local.get.mockReset();
  browserMock.storage.local.set.mockReset();
  browserMock.storage.onChanged.addListener.mockReset();
  browserMock.storage.onChanged.removeListener.mockReset();

  browserMock.tabs.query.mockResolvedValue([
    { id: 42, url: "https://example.com/article" },
  ]);
  browserMock.tabs.sendMessage.mockResolvedValue(undefined);
  browserMock.storage.local.get.mockImplementation(async () => ({
    config: stored,
  }));
  browserMock.storage.local.set.mockImplementation(async (value) => {
    stored = value.config;
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Popup", () => {
  it("renders controls, sends the tab toggle, and persists selections", async () => {
    render(<Popup />);

    const toggle = await screen.findByRole("button", { name: "翻译" });
    await screen.findByText("example.com");
    expect((screen.getByLabelText("翻译服务") as HTMLSelectElement).value).toBe(
      "google",
    );
    expect(stored.services.google).toMatchObject({
      kind: "google",
      enabled: true,
    });
    expect(stored.services.google?.apiKey).toBeUndefined();
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(42, {
        type: "toggleTranslate",
        tabId: 42,
      }),
    );
    expect(screen.getByRole("button", { name: "显示原文" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("翻译服务"), {
      target: { value: "deeplx" },
    });
    await waitFor(() => expect(stored.service).toBe("deeplx"));

    fireEvent.change(screen.getByLabelText("目标语言"), {
      target: { value: "ja" },
    });
    await waitFor(() => expect(stored.targetLanguage).toBe("ja"));
  });

  it("writes mutually exclusive rules for the current hostname", async () => {
    stored.neverTranslateSites = ["example.com"];
    render(<Popup />);

    const always = await screen.findByRole("checkbox", {
      name: "总是翻译",
    });
    fireEvent.click(always);

    await waitFor(() => {
      expect(stored.alwaysTranslateSites).toEqual(["example.com"]);
      expect(stored.neverTranslateSites).toEqual([]);
    });
  });

  it("dispatches every more-menu action and confirms cache clearing", async () => {
    render(<Popup />);
    await screen.findByRole("button", { name: "翻译" });
    fireEvent.click(screen.getByRole("button", { name: "更多" }));

    fireEvent.click(screen.getByRole("menuitem", { name: "清除缓存" }));
    await screen.findByText("已清除 4 条缓存");
    expect(window.confirm).toHaveBeenCalledWith("确认清除 4 条缓存吗？");
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: "getCacheStats",
    });
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: "clearCache",
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "设置" }));
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("menuitem", { name: "快捷键" }));
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "chrome://extensions/shortcuts",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "反馈" }));
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "https://github.com/example/bilingual-translator/issues",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "翻译本地 PDF" }));
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/src/pdf/index.html",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "翻译字幕文件" }));
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/src/subtitle-file/index.html",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "打开侧边栏" }));
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: "openSidePanel",
      tabId: 42,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "导出/导入配置" }));
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/options.html#data",
    });
  });

  it("does not clear the cache when confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<Popup />);
    await screen.findByRole("button", { name: "翻译" });
    fireEvent.click(screen.getByRole("button", { name: "更多" }));

    fireEvent.click(screen.getByRole("menuitem", { name: "清除缓存" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());

    expect(browserMock.runtime.sendMessage).not.toHaveBeenCalledWith({
      type: "clearCache",
    });
  });

  it("lists ChatGPT only when OAuth is authenticated", async () => {
    browserMock.runtime.sendMessage.mockImplementation(
      async (message: { type?: string }) =>
        message.type === "chatgptOauth.status"
          ? { state: "authenticated", account: {} }
          : undefined,
    );
    render(<Popup />);

    const select = (await screen.findByLabelText(
      "翻译服务",
    )) as HTMLSelectElement;
    await waitFor(() =>
      expect(
        Array.from(select.options).map((option) => option.value),
      ).toContain("chatgpt"),
    );
  });
});
