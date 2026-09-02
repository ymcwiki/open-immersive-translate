import {
  connectTranslatePort,
  type ContentTranslatePort,
} from "../shared/messages";
import type { Config } from "../shared/types";
import type {
  BilingualSubtitleCue,
  SubtitleCue,
} from "../shared/subtitle-types";

const MAX_BATCH_CUES = 50;
const MAX_BATCH_CHARS = 4_000;
let sequence = 0;

export function batchSubtitleFileCues(
  cues: readonly SubtitleCue[],
): SubtitleCue[][] {
  const batches: SubtitleCue[][] = [];
  let batch: SubtitleCue[] = [];
  let chars = 0;
  for (const cue of cues) {
    if (
      batch.length &&
      (batch.length >= MAX_BATCH_CUES ||
        chars + cue.text.length > MAX_BATCH_CHARS)
    ) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(cue);
    chars += cue.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function translateBatch(
  port: ContentTranslatePort,
  cues: readonly SubtitleCue[],
  config: Config,
): Promise<string[]> {
  const requestId = `subtitle-file-${Date.now().toString(36)}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const results = new Map<string, string>();
    const stopMessage = port.onMessage((message) => {
      if (message.requestId !== requestId) return;
      for (const result of message.results) {
        if (result.error) {
          stopMessage();
          stopDisconnect();
          reject(new Error(result.error.message));
          return;
        }
        results.set(result.id, result.text ?? "");
      }
      if (!message.done) return;
      stopMessage();
      stopDisconnect();
      const translations = cues.map((_, index) =>
        results.get(`${requestId}-${index}`),
      );
      if (translations.some((translation) => translation === undefined)) {
        reject(new Error("Translation ended without every subtitle cue."));
        return;
      }
      resolve(translations as string[]);
    });
    const stopDisconnect = port.onDisconnect(() => {
      stopMessage();
      stopDisconnect();
      reject(new Error("Translation connection closed."));
    });
    port.postMessage({
      type: "translate",
      requestId,
      paragraphs: cues.map((cue, index) => ({
        id: `${requestId}-${index}`,
        text: cue.text,
        priority: "interactive",
      })),
      from: config.sourceLanguage,
      to: config.targetLanguage,
      service: config.service,
      glossary: config.glossaries,
      priority: "interactive",
      context: { title: "Local subtitle file" },
    });
  });
}

/** Translate every cue through the existing background translation port. */
export async function translateSubtitleFileCues(
  cues: readonly SubtitleCue[],
  config: Config,
  openPort: () => ContentTranslatePort = connectTranslatePort,
): Promise<BilingualSubtitleCue[]> {
  const port = openPort();
  const output: BilingualSubtitleCue[] = [];
  try {
    for (const batch of batchSubtitleFileCues(cues)) {
      const translations = await translateBatch(port, batch, config);
      output.push(
        ...batch.map((cue, index) => ({
          ...cue,
          translation: translations[index],
        })),
      );
    }
    return output;
  } finally {
    port.disconnect();
  }
}
