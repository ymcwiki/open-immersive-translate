import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => ({
  updated: undefined as
    ((tabId: number, change: { url?: string }) => void) | undefined,
  headers: undefined as
    | ((details: {
        tabId: number;
        type: string;
        url: string;
        responseHeaders?: Array<{ name?: string; value?: string }>;
      }) => void)
    | undefined,
}));

const browserMock = vi.hoisted(() => ({
  runtime: {
    getURL: vi.fn(() => "chrome-extension://test/src/pdf/index.html"),
  },
  tabs: {
    update: vi.fn(),
    onUpdated: {
      addListener: vi.fn((listener) => {
        listeners.updated = listener;
      }),
      removeListener: vi.fn(),
    },
  },
  webRequest: {
    onHeadersReceived: {
      addListener: vi.fn((listener) => {
        listeners.headers = listener;
      }),
      removeListener: vi.fn(),
    },
  },
  storage: {
    local: { get: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import {
  isPdfContentType,
  registerPdfInterception,
} from "../../src/pdf/intercept";
import type { Config } from "../../src/shared/types";

beforeEach(() => {
  listeners.updated = undefined;
  listeners.headers = undefined;
  browserMock.tabs.update.mockReset();
});

describe("PDF interception", () => {
  it("redirects a PDF URL only when the PDF setting is enabled", async () => {
    const updateTab = vi.fn().mockResolvedValue(undefined);
    const dispose = registerPdfInterception({
      getConfig: async () =>
        ({
          pdf: { interceptLinks: true },
          translationMode: "dual",
          theme: "underline",
        }) as unknown as Config,
      getReaderBaseUrl: () => "chrome-extension://test/src/pdf/index.html",
      updateTab,
    });

    listeners.updated?.(7, { url: "https://example.com/paper.pdf?download=1" });
    await vi.waitFor(() => expect(updateTab).toHaveBeenCalledOnce());
    expect(updateTab).toHaveBeenCalledWith(
      7,
      "chrome-extension://test/src/pdf/index.html?file=https%3A%2F%2Fexample.com%2Fpaper.pdf%3Fdownload%3D1",
    );
    dispose();
    expect(browserMock.tabs.onUpdated.removeListener).toHaveBeenCalled();
  });

  it("leaves PDF navigations alone when interception is disabled", async () => {
    const updateTab = vi.fn().mockResolvedValue(undefined);
    registerPdfInterception({
      getConfig: async () =>
        ({
          pdf: { interceptLinks: false },
          translationMode: "dual",
          theme: "underline",
        }) as unknown as Config,
      updateTab,
    });

    listeners.updated?.(8, { url: "https://example.com/paper.pdf" });
    await Promise.resolve();
    await Promise.resolve();
    expect(updateTab).not.toHaveBeenCalled();
  });

  it("detects application/pdf response headers for extensionless URLs", async () => {
    const updateTab = vi.fn().mockResolvedValue(undefined);
    registerPdfInterception({
      getConfig: async () =>
        ({
          pdf: { interceptLinks: true },
          translationMode: "dual",
          theme: "underline",
        }) as unknown as Config,
      getReaderBaseUrl: () => "chrome-extension://test/src/pdf/index.html",
      updateTab,
    });

    expect(
      isPdfContentType([
        { name: "Content-Type", value: "application/pdf; charset=binary" },
      ]),
    ).toBe(true);
    listeners.headers?.({
      tabId: 9,
      type: "main_frame",
      url: "https://example.com/download/42",
      responseHeaders: [{ name: "content-type", value: "application/pdf" }],
    });
    await vi.waitFor(() => expect(updateTab).toHaveBeenCalledOnce());
  });
});
