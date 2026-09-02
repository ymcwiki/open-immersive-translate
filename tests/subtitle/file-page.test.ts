import { describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  runtime: { connect: vi.fn() },
}));
vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import type { ContentTranslatePort } from "../../src/shared/messages";
import type { Config } from "../../src/shared/types";
import {
  parseSubtitleFile,
  serializeSubtitleFile,
  translatedFilename,
} from "../../src/subtitle-file/file-formats";
import {
  batchSubtitleFileCues,
  translateSubtitleFileCues,
} from "../../src/subtitle-file/translator";

function fakePort(): ContentTranslatePort {
  const messageListeners = new Set<
    (
      message: Parameters<Parameters<ContentTranslatePort["onMessage"]>[0]>[0],
    ) => void
  >();
  return {
    postMessage(message) {
      if (message.type !== "translate") return;
      queueMicrotask(() => {
        for (const listener of messageListeners) {
          listener({
            type: "translateResult",
            requestId: message.requestId,
            results: message.paragraphs.map((paragraph) => ({
              id: paragraph.id,
              text: `译:${paragraph.text}`,
            })),
            done: true,
          });
        }
      });
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onDisconnect() {
      return () => undefined;
    },
    disconnect: vi.fn(),
  };
}

describe("local subtitle file workflow", () => {
  it("detects formats, serializes translations, and names downloads", () => {
    const document = parseSubtitleFile(
      "lesson.vtt",
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n",
    );
    document.cues[0].translation = "你好";
    expect(serializeSubtitleFile(document, "bilingual")).toContain(
      "Hello\n你好",
    );
    expect(translatedFilename(document, "translation-only")).toBe(
      "lesson.translated.vtt",
    );
  });

  it("batches and translates all cues through the background port", async () => {
    const cues = Array.from({ length: 51 }, (_, index) => ({
      start: index,
      end: index + 0.5,
      text: `Cue ${index}`,
    }));
    expect(batchSubtitleFileCues(cues)).toHaveLength(2);
    const result = await translateSubtitleFileCues(
      cues,
      {
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
        service: "mock",
        glossaries: [],
      } as unknown as Config,
      fakePort,
    );
    expect(result).toHaveLength(51);
    expect(result[50].translation).toBe("译:Cue 50");
  });
});
