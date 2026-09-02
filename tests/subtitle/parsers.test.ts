import { describe, expect, it } from "vitest";

import {
  parseBilibiliJson,
  parseSrt,
  parseTimestamp,
  parseTtml,
  parseWebVtt,
  parseYouTubeJson3,
  serializeSrt,
  serializeWebVtt,
} from "../../src/content/features/subtitle/parsers";

describe("subtitle parsers", () => {
  it("parses WebVTT identifiers, settings, and multiline text", () => {
    const cues = parseWebVtt(`WEBVTT

intro
00:00:01.000 --> 00:00:03.500 align:start position:10%
Hello
world

00:04.000 --> 00:05.000
Next cue
`);

    expect(cues).toEqual([
      {
        id: "intro",
        start: 1,
        end: 3.5,
        text: "Hello\nworld",
        settings: "align:start position:10%",
      },
      {
        id: undefined,
        start: 4,
        end: 5,
        text: "Next cue",
        settings: undefined,
      },
    ]);
  });

  it("parses and serializes SRT cues", () => {
    const cues = parseSrt(`1
00:00:01,200 --> 00:00:02,500
Hello

2
00:00:03,000 --> 00:00:04,000
World
`);
    expect(cues.map(({ start, end, text }) => ({ start, end, text }))).toEqual([
      { start: 1.2, end: 2.5, text: "Hello" },
      { start: 3, end: 4, text: "World" },
    ]);
    expect(
      serializeSrt(
        cues.map((cue, index) => ({
          ...cue,
          translation: ["你好", "世界"][index],
        })),
        "bilingual",
      ),
    ).toContain("Hello\n你好");
  });

  it("parses TTML clock, duration, frames, and line breaks", () => {
    const cues = parseTtml(`<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="25">
  <body><div>
    <p begin="1.5s" dur="2s">First<br/>line</p>
    <p begin="00:00:05:12" end="00:00:06:12">Frame cue</p>
  </div></body>
</tt>`);
    expect(cues).toEqual([
      { id: "1", start: 1.5, end: 3.5, text: "First\nline" },
      { id: "2", start: 5.48, end: 6.48, text: "Frame cue" },
    ]);
    expect(parseTimestamp("1500ms")).toBe(1.5);
  });

  it("parses YouTube json3 and Bilibili JSON", () => {
    expect(
      parseYouTubeJson3({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 1500,
            segs: [{ utf8: "Hello " }, { utf8: "world" }],
          },
          { tStartMs: 2500, dDurationMs: 500 },
        ],
      }),
    ).toEqual([{ id: "1", start: 1, end: 2.5, text: "Hello world" }]);
    expect(
      parseBilibiliJson(
        JSON.stringify({ body: [{ from: 2, to: 4, content: "你好" }] }),
      ),
    ).toEqual([{ id: "1", start: 2, end: 4, text: "你好" }]);
  });

  it("serializes translated WebVTT without dropping cue settings", () => {
    const output = serializeWebVtt(
      [
        {
          id: "a",
          start: 1,
          end: 2,
          text: "Hello",
          translation: "你好",
          settings: "align:start",
        },
      ],
      "translation-only",
    );
    expect(output).toBe(
      "WEBVTT\n\na\n00:00:01.000 --> 00:00:02.000 align:start\n你好\n",
    );
  });
});
