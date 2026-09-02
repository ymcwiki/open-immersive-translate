import type {
  BilingualSubtitleCue,
  SubtitleCue,
} from "../../../shared/subtitle-types";
import type { SubtitleExportMode } from "./parsers";

interface AssDialogueLine {
  type: "dialogue";
  cueIndex: number;
  fields: string[];
  textIndex: number;
}

interface AssRawLine {
  type: "raw";
  value: string;
}

type AssLine = AssDialogueLine | AssRawLine;

export interface AssDocument {
  cues: SubtitleCue[];
  lines: AssLine[];
  newline: "\n" | "\r\n";
  trailingNewline: boolean;
}

function parseAssTimestamp(value: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2})[.](\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4].padEnd(2, "0")) / 100
  );
}

function splitFields(value: string, count: number): string[] {
  const fields: string[] = [];
  let remaining = value;
  for (let index = 1; index < count; index += 1) {
    const comma = remaining.indexOf(",");
    if (comma < 0) break;
    fields.push(remaining.slice(0, comma));
    remaining = remaining.slice(comma + 1);
  }
  fields.push(remaining);
  return fields;
}

/** Parse ASS dialogue lines while retaining every non-dialogue line verbatim. */
export function parseAss(input: string): AssDocument {
  const newline = input.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\r?\n$/.test(input);
  const rawLines = input.replace(/\r\n?/g, "\n").split("\n");
  if (trailingNewline) rawLines.pop();

  const cues: SubtitleCue[] = [];
  const lines: AssLine[] = [];
  let inEvents = false;
  let format = [
    "Layer",
    "Start",
    "End",
    "Style",
    "Name",
    "MarginL",
    "MarginR",
    "MarginV",
    "Effect",
    "Text",
  ];

  for (const line of rawLines) {
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (section) inEvents = section[1].toLowerCase() === "events";
    const formatMatch = inEvents ? /^\s*Format\s*:\s*(.*)$/i.exec(line) : null;
    if (formatMatch) {
      format = formatMatch[1].split(",").map((field) => field.trim());
      lines.push({ type: "raw", value: line });
      continue;
    }

    const dialogue = inEvents ? /^(\s*Dialogue\s*:\s*)(.*)$/i.exec(line) : null;
    const startIndex = format.findIndex(
      (field) => field.toLowerCase() === "start",
    );
    const endIndex = format.findIndex((field) => field.toLowerCase() === "end");
    const textIndex = format.findIndex(
      (field) => field.toLowerCase() === "text",
    );
    if (!dialogue || startIndex < 0 || endIndex < 0 || textIndex < 0) {
      lines.push({ type: "raw", value: line });
      continue;
    }

    const fields = splitFields(dialogue[2], format.length);
    const start = parseAssTimestamp(fields[startIndex] ?? "");
    const end = parseAssTimestamp(fields[endIndex] ?? "");
    const text = fields[textIndex] ?? "";
    if (start === null || end === null || end <= start || !text.trim()) {
      lines.push({ type: "raw", value: line });
      continue;
    }
    const cueIndex = cues.length;
    cues.push({ id: String(cueIndex + 1), start, end, text });
    fields[0] = `${dialogue[1]}${fields[0] ?? ""}`;
    lines.push({ type: "dialogue", cueIndex, fields, textIndex });
  }
  return { cues, lines, newline, trailingNewline };
}

/** Serialize translated ASS cues without changing the script/style headers. */
export function serializeAss(
  document: AssDocument,
  cues: readonly BilingualSubtitleCue[],
  mode: SubtitleExportMode,
): string {
  const output = document.lines.map((line) => {
    if (line.type === "raw") return line.value;
    const fields = [...line.fields];
    const cue = cues[line.cueIndex] ?? document.cues[line.cueIndex];
    const text =
      mode === "translation-only"
        ? (cue.translation ?? cue.text)
        : cue.translation
          ? `${cue.text}\\N${cue.translation}`
          : cue.text;
    fields[line.textIndex] = text;
    return fields.join(",");
  });
  const result = output.join(document.newline);
  return document.trailingNewline ? `${result}${document.newline}` : result;
}
