import { afterEach, describe, expect, it, vi } from "vitest";

const messageListeners = new Set<(message: unknown) => unknown>();
const browserMock = vi.hoisted(() => ({
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    sendMessage: vi.fn(async () => ({})),
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => unknown) =>
        messageListeners.add(listener),
      ),
      removeListener: vi.fn((listener: (message: unknown) => unknown) =>
        messageListeners.delete(listener),
      ),
    },
  },
}));
vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import type { FeatureContext } from "../../src/content/features/context";
import {
  initSubtitles,
  TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE,
} from "../../src/content/features/subtitle";

afterEach(() => {
  messageListeners.clear();
  browserMock.runtime.sendMessage.mockClear();
  document.body.replaceChildren();
});

describe("subtitle feature initialization", () => {
  it("handles the pre-translation toggle message and persists it", () => {
    const dispose = initSubtitles({
      config: {
        subtitle: { youtube: true },
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
      },
      translateText: vi.fn(),
    } as unknown as FeatureContext);
    for (const listener of messageListeners) {
      listener({ type: TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE });
    }
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: "setConfig",
      patch: {
        subtitle: expect.objectContaining({ preTranslation: false }),
      },
    });
    dispose();
  });
});
