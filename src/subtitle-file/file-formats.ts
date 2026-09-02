import type { BilingualSubtitleCue } from "../shared/subtitle-types";
import {
  parseAss,
  serializeAss,
  type AssDocument,
} from "../content/features/subtitle/ass";
import {
  parseSrt,
  parseWebVtt,
  serializeSrt,
  serializeWebVtt,
  type SubtitleExportMode,
} from "../content/features/subtitle/parsers";

export type SubtitleFileFormat = "srt" | "vtt" | "ass";

export interface SubtitleFileDocument {
  format: SubtitleFileFormat;
  name: string;
  cues: BilingualSubtitleCue[];
  ass?: AssDocument;
}

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function parseSubtitleFile(
  name: string,
  contents: string,
): SubtitleFileDocument {
  const ext = extension(name);
  if (ext === "ass" || ext === "ssa") {
    const ass = parseAss(contents);
    return { format: "ass", name, cues: ass.cues, ass };
  }
  if (ext === "vtt" || contents.trimStart().startsWith("WEBVTT")) {
    return { format: "vtt", name, cues: parseWebVtt(contents) };
  }
  return { format: "srt", name, cues: parseSrt(contents) };
}

export function serializeSubtitleFile(
  document: SubtitleFileDocument,
  mode: SubtitleExportMode,
): string {
  if (document.format === "ass" && document.ass) {
    return serializeAss(document.ass, document.cues, mode);
  }
  if (document.format === "vtt") return serializeWebVtt(document.cues, mode);
  return serializeSrt(document.cues, mode);
}

export function translatedFilename(
  document: SubtitleFileDocument,
  mode: SubtitleExportMode,
): string {
  const suffix = mode === "bilingual" ? "bilingual" : "translated";
  const dot = document.name.lastIndexOf(".");
  const base = dot > 0 ? document.name.slice(0, dot) : document.name;
  return `${base}.${suffix}.${document.format}`;
}
