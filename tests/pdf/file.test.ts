import { describe, expect, it } from "vitest";

import { isPdfFile, readPdfFile } from "../../src/pdf/file";

describe("local PDF files", () => {
  it("accepts PDF MIME types or file extensions and reads with FileReader", async () => {
    const byType = new File([new Uint8Array([1, 2, 3])], "upload", {
      type: "application/pdf",
    });
    const byName = new File([new Uint8Array([4])], "REPORT.PDF");

    expect(isPdfFile(byType)).toBe(true);
    expect(isPdfFile(byName)).toBe(true);
    expect(isPdfFile(new File(["x"], "notes.txt"))).toBe(false);
    expect(Array.from(await readPdfFile(byType))).toEqual([1, 2, 3]);
  });
});
