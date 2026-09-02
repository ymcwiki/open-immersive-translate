import { describe, expect, it } from "vitest";

import {
  parseAss,
  serializeAss,
} from "../../src/content/features/subtitle/ass";

const fixture = `[Script Info]\r
Title: Demo\r
\r
[V4+ Styles]\r
Format: Name, Fontname, Fontsize\r
Style: Default,Arial,20\r
\r
[Events]\r
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r
Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,keep this\r
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello, world\r
`;

describe("ASS parser and serializer", () => {
  it("keeps headers and non-dialogue event lines verbatim", () => {
    const document = parseAss(fixture);
    expect(document.cues).toEqual([
      { id: "1", start: 1, end: 3.5, text: "Hello, world" },
    ]);
    const output = serializeAss(
      document,
      [{ ...document.cues[0], translation: "你好，世界" }],
      "bilingual",
    );
    expect(output).toContain(
      "[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize",
    );
    expect(output).toContain(
      "Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,keep this",
    );
    expect(output).toContain(
      "Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello, world\\N你好，世界",
    );
    expect(output.endsWith("\r\n")).toBe(true);
  });

  it("can export translated-only ASS", () => {
    const document = parseAss(fixture);
    const output = serializeAss(
      document,
      [{ ...document.cues[0], translation: "Translation" }],
      "translation-only",
    );
    expect(output).toContain(",,Translation\r\n");
    expect(output).not.toContain("Hello, world\\N");
  });
});
