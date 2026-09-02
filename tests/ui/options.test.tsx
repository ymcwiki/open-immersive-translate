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
});
