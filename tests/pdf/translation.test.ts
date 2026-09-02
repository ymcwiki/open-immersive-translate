import { beforeEach, describe, expect, it, vi } from "vitest";

const portState = vi.hoisted(() => ({
  messageListener: undefined as ((message: unknown) => void) | undefined,
  disconnectListener: undefined as (() => void) | undefined,
}));

const rawPort = vi.hoisted(() => ({
  name: "imt:translate",
  sender: { tab: { id: 4 } },
  postMessage: vi.fn(),
  disconnect: vi.fn(),
  onMessage: {
    addListener: vi.fn((listener) => {
      portState.messageListener = listener;
    }),
    removeListener: vi.fn(),
  },
  onDisconnect: {
    addListener: vi.fn((listener) => {
      portState.disconnectListener = listener;
    }),
    removeListener: vi.fn(),
  },
}));

const browserMock = vi.hoisted(() => ({
  runtime: {
    connect: vi.fn(() => rawPort),
    onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: { sendMessage: vi.fn() },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import { PdfTranslationClient } from "../../src/pdf/translation";

beforeEach(() => {
  rawPort.postMessage.mockReset();
  rawPort.disconnect.mockReset();
  portState.messageListener = undefined;
});

describe("PdfTranslationClient", () => {
  it("uses the shared translate port and forwards streamed paragraph results", () => {
    const onResult = vi.fn();
    const client = new PdfTranslationClient(onResult);
    const requestId = client.translate({
      paragraphs: [{ id: "pdf-1-1-1", text: "Hello" }],
      from: "en",
      to: "zh-CN",
      service: "google",
    });

    expect(rawPort.postMessage).toHaveBeenCalledWith({
      type: "translate",
      requestId,
      paragraphs: [{ id: "pdf-1-1-1", text: "Hello" }],
      from: "en",
      to: "zh-CN",
      service: "google",
      glossary: undefined,
      context: undefined,
      priority: "viewport",
    });

    portState.messageListener?.({
      type: "translateResult",
      requestId,
      results: [{ id: "pdf-1-1-1", text: "你好" }],
      done: true,
    });
    expect(onResult).toHaveBeenCalledWith(
      [{ id: "pdf-1-1-1", text: "你好" }],
      true,
    );
    client.dispose();
    expect(rawPort.disconnect).toHaveBeenCalledOnce();
  });
});
