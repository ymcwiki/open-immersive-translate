import type {
  BilingualSubtitleCue,
  SubtitleCue,
  SubtitleNetworkFormat,
} from "../../../shared/subtitle-types";

const TIMING_SEPARATOR = /\s+-->\s+/;

function normalizeLines(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/** Parse WebVTT, SRT, and TTML clock values into seconds. */
export function parseTimestamp(value: string, frameRate = 30): number | null {
  const input = value.trim();
  const offset = /^(-?\d+(?:\.\d+)?)(h|m|s|ms|f)$/.exec(input);
  if (offset) {
    const amount = Number(offset[1]);
    const factor =
      offset[2] === "h"
        ? 3600
        : offset[2] === "m"
          ? 60
          : offset[2] === "ms"
            ? 0.001
            : offset[2] === "f"
              ? 1 / frameRate
              : 1;
    return amount * factor;
  }

  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(input);
  if (clock) {
    const hours = Number(clock[1] ?? 0);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3]);
    const milliseconds = Number((clock[4] ?? "0").padEnd(3, "0"));
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }

  const frameClock = /^(\d+):(\d{2}):(\d{2}):(\d{2})$/.exec(input);
  if (frameClock) {
    return (
      Number(frameClock[1]) * 3600 +
      Number(frameClock[2]) * 60 +
      Number(frameClock[3]) +
      Number(frameClock[4]) / frameRate
    );
  }
  return null;
}

function parseCueBlocks(input: string, format: "srt" | "vtt"): SubtitleCue[] {
  const blocks = normalizeLines(input).split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (!lines.length || /^WEBVTT(?:\s|$)/.test(lines[0])) continue;
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue;

    const timingIndex = lines.findIndex((line) => TIMING_SEPARATOR.test(line));
    if (timingIndex < 0) continue;
    const [rawStart, rawEndAndSettings] = lines[timingIndex].split(
      TIMING_SEPARATOR,
      2,
    );
    const endMatch = /^(\S+)(?:\s+(.*))?$/.exec(rawEndAndSettings ?? "");
    const start = parseTimestamp(rawStart ?? "");
    const end = parseTimestamp(endMatch?.[1] ?? "");
    if (start === null || end === null || end <= start) continue;

    const id = timingIndex > 0 ? lines[timingIndex - 1].trim() : undefined;
    const text = lines
      .slice(timingIndex + 1)
      .join("\n")
      .trim();
    if (!text) continue;
    cues.push({
      id: id || (format === "srt" ? String(cues.length + 1) : undefined),
      start,
      end,
      text,
      settings: endMatch?.[2],
    });
  }
  return cues;
}

export function parseWebVtt(input: string): SubtitleCue[] {
  return parseCueBlocks(input, "vtt");
}

export function parseSrt(input: string): SubtitleCue[] {
  return parseCueBlocks(input, "srt");
}

function nodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  if (node instanceof Element && node.localName.toLowerCase() === "br") {
    return "\n";
  }
  return Array.from(node.childNodes, nodeText).join("");
}

/** Parse TTML and DFXP paragraph cues. */
export function parseTtml(input: string): SubtitleCue[] {
  const document = new DOMParser().parseFromString(input, "application/xml");
  if (document.querySelector("parsererror")) return [];
  const root = document.documentElement;
  const frameRate = Number(
    root.getAttribute("ttp:frameRate") ?? root.getAttribute("frameRate") ?? 30,
  );
  const paragraphs = Array.from(document.getElementsByTagNameNS("*", "p"));

  return paragraphs.flatMap((paragraph, index) => {
    const start = parseTimestamp(
      paragraph.getAttribute("begin") ?? "",
      frameRate,
    );
    const explicitEnd = parseTimestamp(
      paragraph.getAttribute("end") ?? "",
      frameRate,
    );
    const duration = parseTimestamp(
      paragraph.getAttribute("dur") ?? "",
      frameRate,
    );
    const end =
      explicitEnd ??
      (start === null || duration === null ? null : start + duration);
    const text = nodeText(paragraph)
      .replace(/[ \t]+/g, " ")
      .trim();
    if (start === null || end === null || end <= start || !text) return [];
    return [{ id: paragraph.id || String(index + 1), start, end, text }];
  });
}

interface YouTubeSegment {
  utf8?: unknown;
}

interface YouTubeEvent {
  tStartMs?: unknown;
  dDurationMs?: unknown;
  segs?: YouTubeSegment[];
}

function jsonValue(input: string | unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Parse YouTube json3 timed-text responses. */
export function parseYouTubeJson3(input: string | unknown): SubtitleCue[] {
  const value = record(jsonValue(input));
  const events = Array.isArray(value?.events)
    ? (value.events as YouTubeEvent[])
    : [];
  return events.flatMap((event, index) => {
    const startMs = Number(event.tStartMs);
    const durationMs = Number(event.dDurationMs);
    const text = Array.isArray(event.segs)
      ? event.segs
          .map((segment) =>
            typeof segment.utf8 === "string" ? segment.utf8 : "",
          )
          .join("")
          .trim()
      : "";
    if (!Number.isFinite(startMs) || !Number.isFinite(durationMs) || !text) {
      return [];
    }
    return [
      {
        id: String(index + 1),
        start: startMs / 1000,
        end: (startMs + Math.max(durationMs, 1)) / 1000,
        text,
      },
    ];
  });
}

interface BilibiliCue {
  from?: unknown;
  to?: unknown;
  content?: unknown;
}

/** Parse Bilibili subtitle JSON responses. */
export function parseBilibiliJson(input: string | unknown): SubtitleCue[] {
  const value = record(jsonValue(input));
  const data = record(value?.data);
  const rawBody = value?.body ?? data?.body;
  const body = Array.isArray(rawBody) ? (rawBody as BilibiliCue[]) : [];
  return body.flatMap((cue, index) => {
    const start = Number(cue.from);
    const end = Number(cue.to);
    const text = typeof cue.content === "string" ? cue.content.trim() : "";
    return Number.isFinite(start) && Number.isFinite(end) && end > start && text
      ? [{ id: String(index + 1), start, end, text }]
      : [];
  });
}

export function parseCapturedSubtitle(
  format: SubtitleNetworkFormat,
  body: string,
): SubtitleCue[] {
  if (format === "webvtt") return parseWebVtt(body);
  if (format === "ttml") return parseTtml(body);
  if (format === "youtube-json3") return parseYouTubeJson3(body);
  if (format === "bilibili-json") return parseBilibiliJson(body);

  const trimmed = body.trimStart();
  if (trimmed.startsWith("WEBVTT")) return parseWebVtt(body);
  if (trimmed.startsWith("<")) return parseTtml(body);
  const youtube = parseYouTubeJson3(body);
  return youtube.length ? youtube : parseBilibiliJson(body);
}

function timestamp(value: number, separator: "." | ","): string {
  const milliseconds = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const fraction = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(fraction).padStart(3, "0")}`;
}

export type SubtitleExportMode = "bilingual" | "translation-only";

function outputText(
  cue: BilingualSubtitleCue,
  mode: SubtitleExportMode,
  separator: string,
): string {
  if (mode === "translation-only") return cue.translation ?? cue.text;
  return cue.translation
    ? `${cue.text}${separator}${cue.translation}`
    : cue.text;
}

export function serializeSrt(
  cues: readonly BilingualSubtitleCue[],
  mode: SubtitleExportMode,
): string {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.start, ",")} --> ${timestamp(cue.end, ",")}\n${outputText(cue, mode, "\n")}`,
    )
    .join("\n\n")}\n`;
}

export function serializeWebVtt(
  cues: readonly BilingualSubtitleCue[],
  mode: SubtitleExportMode,
): string {
  const blocks = cues.map((cue) => {
    const id = cue.id ? `${cue.id}\n` : "";
    const settings = cue.settings ? ` ${cue.settings}` : "";
    return `${id}${timestamp(cue.start, ".")} --> ${timestamp(cue.end, ".")}${settings}\n${outputText(cue, mode, "\n")}`;
  });
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}
