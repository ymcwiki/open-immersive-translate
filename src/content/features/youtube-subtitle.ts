import browser from "webextension-polyfill";

import type { FeatureContext } from "./context";

const MAIN_SOURCE = "imt-youtube-main";
const CONTENT_SOURCE = "imt-youtube-content";
const MAX_TRANSLATIONS_PER_BATCH = 50;

interface TimedTextSegment {
  utf8?: string;
  [key: string]: unknown;
}

interface TimedTextEvent {
  segs?: TimedTextSegment[];
  [key: string]: unknown;
}

export interface TimedTextJson {
  events?: TimedTextEvent[];
  [key: string]: unknown;
}

interface MainTranslationMessage {
  source: typeof MAIN_SOURCE;
  type: "translate";
  id: string;
  payload: TimedTextJson;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTranslationMessage(value: unknown): value is MainTranslationMessage {
  if (!isRecord(value)) return false;
  return (
    value.source === MAIN_SOURCE &&
    value.type === "translate" &&
    typeof value.id === "string" &&
    isRecord(value.payload)
  );
}

/** Join the word-level segments in each caption event into one sentence. */
export function joinTimedTextSentences(payload: TimedTextJson): TimedTextJson {
  return {
    ...payload,
    events: payload.events?.map((event) => {
      if (!event.segs?.length) return { ...event };
      const first = event.segs[0];
      return {
        ...event,
        segs: [
          {
            ...first,
            utf8: event.segs.map((segment) => segment.utf8 ?? "").join(""),
          },
        ],
      };
    }),
  };
}

/** Return every translated segment source in document order. */
export function timedTextSegmentTexts(payload: TimedTextJson): string[] {
  return (
    payload.events?.flatMap(
      (event) =>
        event.segs?.flatMap((segment) =>
          typeof segment.utf8 === "string" ? [segment.utf8] : [],
        ) ?? [],
    ) ?? []
  );
}

/** Merge ordered translations without mutating the intercepted response. */
export function mergeTimedText(
  payload: TimedTextJson,
  translations: readonly string[],
): TimedTextJson {
  let translationIndex = 0;
  return {
    ...payload,
    events: payload.events?.map((event) => ({
      ...event,
      segs: event.segs?.map((segment) => {
        if (typeof segment.utf8 !== "string") return { ...segment };
        const translation = translations[translationIndex++] ?? "";
        return { ...segment, utf8: `${segment.utf8}\n${translation}` };
      }),
    })),
  };
}

async function translateSegments(
  texts: readonly string[],
  ctx: FeatureContext,
): Promise<string[]> {
  const translations: string[] = [];
  for (
    let start = 0;
    start < texts.length;
    start += MAX_TRANSLATIONS_PER_BATCH
  ) {
    const batch = texts.slice(start, start + MAX_TRANSLATIONS_PER_BATCH);
    const translated = await Promise.all(
      batch.map((text) =>
        ctx.translateText(
          text,
          ctx.config.sourceLanguage,
          ctx.config.targetLanguage,
        ),
      ),
    );
    translations.push(...translated);
  }
  return translations;
}

function isYouTubeHost(hostname: string): boolean {
  return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
}

/** Install the content-side bridge for MAIN-world subtitle interception. */
export function init(ctx: FeatureContext): () => void {
  if (
    !ctx.config.subtitle.youtube ||
    !isYouTubeHost(window.location.hostname)
  ) {
    return () => undefined;
  }

  const script = document.createElement("script");
  script.dataset.imt = "youtube-main";
  script.type = "module";
  script.src = browser.runtime.getURL("src/content/features/youtube-main.ts");
  script.addEventListener("load", () => script.remove(), { once: true });
  (document.head ?? document.documentElement).append(script);

  let disposed = false;

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (
      disposed ||
      event.source !== window ||
      !isTranslationMessage(event.data)
    ) {
      return;
    }

    const { id, payload } = event.data;
    const sentences = joinTimedTextSentences(payload);
    const texts = timedTextSegmentTexts(sentences);
    void translateSegments(texts, ctx)
      .then((translations) => mergeTimedText(sentences, translations))
      .catch(() => payload)
      .then((translatedPayload) => {
        if (disposed) return;
        window.postMessage(
          {
            source: CONTENT_SOURCE,
            type: "translated",
            id,
            payload: translatedPayload,
          },
          "*",
        );
      });
  };

  window.addEventListener("message", onMessage);

  return () => {
    disposed = true;
    window.removeEventListener("message", onMessage);
    script.remove();
    window.postMessage({ source: CONTENT_SOURCE, type: "dispose" }, "*");
  };
}
