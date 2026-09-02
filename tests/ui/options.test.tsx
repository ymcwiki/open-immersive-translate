import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  runtime: {
    sendMessage: vi.fn(),
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
import type { Config } from "../../src/shared/types";
import { Options } from "../../src/ui/options/index";

let stored: Config;

beforeEach(() => {
  stored = structuredClone(DEFAULT_CONFIG);
  browserMock.runtime.sendMessage.mockReset();
  browserMock.storage.local.get.mockReset();
  browserMock.storage.local.set.mockReset();
  browserMock.storage.onChanged.addListener.mockReset();
  browserMock.storage.onChanged.removeListener.mockReset();
  browserMock.runtime.sendMessage.mockResolvedValue(undefined);
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

describe("Options", () => {
  it("renders tabs and persists general and service settings", async () => {
    render(<Options />);

    await screen.findByRole("heading", { name: "基本", level: 2 });
    fireEvent.click(screen.getByRole("checkbox", { name: "启用" }));
    await waitFor(() => expect(stored.floatBall.enabled).toBe(false));

    fireEvent.click(screen.getByRole("tab", { name: "翻译服务" }));
    await screen.findByRole("heading", { name: "OpenAI 兼容", level: 2 });
    fireEvent.input(screen.getAllByLabelText("模型")[0]!, {
      target: { value: "gpt-test" },
    });

    await waitFor(() =>
      expect(stored.services["openai-compatible"]?.model).toBe("gpt-test"),
    );
  });

  it("sends service connection tests and displays the result", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      ok: true,
      message: "连接正常",
    });
    render(<Options />);

    await screen.findByRole("heading", { name: "基本", level: 2 });
    fireEvent.click(screen.getByRole("tab", { name: "翻译服务" }));
    fireEvent.click(screen.getAllByRole("button", { name: "测试连接" })[0]!);

    await screen.findByText("连接正常");
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "testService",
        serviceId: "openai-compatible",
      }),
    );
  });

  it("rejects a malformed import before confirmation or storage writes", async () => {
    render(<Options />);

    await screen.findByRole("heading", { name: "基本", level: 2 });
    fireEvent.click(screen.getByRole("tab", { name: "缓存 / 导入导出" }));
    const file = new File(["not json"], "bad.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: async () => "not json",
    });
    fireEvent.change(screen.getByLabelText("选择 JSON 文件"), {
      target: { files: [file] },
    });

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain(
      "文件不是有效 JSON",
    );
    expect(window.confirm).not.toHaveBeenCalled();
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("persists input, selection, language-rule, and global CSS settings", async () => {
    render(<Options />);
    await screen.findByRole("heading", { name: "基本", level: 2 });

    fireEvent.click(screen.getByRole("tab", { name: "输入框 / 划词 / 悬停" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "中英自动目标语言" }));
    fireEvent.change(screen.getByLabelText("划词触发方式"), {
      target: { value: "direct" },
    });
    await waitFor(() => {
      expect(
        (stored as unknown as { input: { autoTargetLanguage: boolean } }).input
          .autoTargetLanguage,
      ).toBe(true);
      expect(
        (stored as unknown as { selection: { triggerMode: string } }).selection
          .triggerMode,
      ).toBe("direct");
    });

    fireEvent.click(screen.getByRole("tab", { name: "站点规则" }));
    fireEvent.input(screen.getByLabelText("总是翻译语言"), {
      target: { value: "en, ja" },
    });
    fireEvent.input(screen.getByLabelText("全局 CSS"), {
      target: { value: ".imt-target { color: red; }" },
    });
    await waitFor(() => {
      expect(stored.alwaysTranslateLangs).toEqual(["en", "ja"]);
      expect(stored.globalCustomCss).toContain("red");
    });
  });

  it("persists phase-three feature, remote-rule, and cache settings", async () => {
    render(<Options />);
    await screen.findByRole("heading", { name: "基本", level: 2 });

    fireEvent.click(screen.getByRole("tab", { name: "输入框 / 划词 / 悬停" }));
    fireEvent.change(screen.getByLabelText("输入框目标语言"), {
      target: { value: "ja" },
    });
    fireEvent.input(screen.getByLabelText("字号"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("PDF 显示模式"), {
      target: { value: "translation" },
    });
    fireEvent.change(screen.getByLabelText("侧边栏目标语言"), {
      target: { value: "fr" },
    });
    fireEvent.change(screen.getByLabelText("AI 写作目标语言"), {
      target: { value: "de" },
    });
    fireEvent.input(screen.getByLabelText("总结提示词"), {
      target: { value: "请压缩为三句话" },
    });
    const searchCard = screen
      .getByRole("heading", { name: "搜索增强" })
      .closest("section");
    if (!searchCard) throw new Error("找不到搜索增强设置");
    fireEvent.click(within(searchCard).getByRole("checkbox", { name: "启用" }));

    await waitFor(() => {
      expect(stored.input.targetLanguage).toBe("ja");
      expect(stored.subtitle.fontSize).toBe(30);
      expect(stored.pdf.mode).toBe("translation");
      expect(stored.sidePanel.targetLanguage).toBe("fr");
      expect(stored.aiWriting.targetLanguage).toBe("de");
      expect(stored.aiWriting.prompts.summarize).toBe("请压缩为三句话");
      expect(stored.searchEnhancement.enabled).toBe(true);
    });

    fireEvent.click(screen.getByRole("tab", { name: "站点规则" }));
    fireEvent.click(screen.getByRole("button", { name: "添加订阅" }));
    fireEvent.input(screen.getByLabelText("规则 URL 1"), {
      target: { value: "https://example.com/rules.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存订阅" }));
    await waitFor(() =>
      expect(stored.remoteRules).toEqual([
        { url: "https://example.com/rules.json", enabled: true },
      ]),
    );

    fireEvent.click(screen.getByRole("tab", { name: "缓存 / 导入导出" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "启用译文缓存" }));
    fireEvent.input(screen.getByLabelText("缓存保留天数"), {
      target: { value: "14" },
    });
    await waitFor(() => {
      expect(stored.cache.enabled).toBe(false);
      expect(stored.cache.maxAgeDays).toBe(14);
    });
  });
});
