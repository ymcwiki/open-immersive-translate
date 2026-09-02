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
  },
  tabs: {
    query: vi.fn(),
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
import { Popup } from "../../src/ui/popup/index";
import type { Config } from "../../src/shared/types";

let stored: Config;

beforeEach(() => {
  stored = structuredClone(DEFAULT_CONFIG);
  browserMock.runtime.openOptionsPage.mockReset();
  browserMock.tabs.query.mockReset();
  browserMock.tabs.sendMessage.mockReset();
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
});

afterEach(cleanup);

describe("Popup", () => {
  it("renders controls, sends the tab toggle, and persists selections", async () => {
    render(<Popup />);

    const toggle = await screen.findByRole("button", { name: "翻译" });
    await screen.findByText("example.com");
    expect(
      (screen.getByLabelText("翻译服务") as HTMLSelectElement).value,
    ).toBe("google");
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
});
