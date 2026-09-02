import { describe, expect, it } from "vitest";

import {
  isPdfUrl,
  normalizePdfUrl,
  pdfReaderUrl,
  pdfUrlFromLocation,
} from "../../src/pdf/url";

describe("PDF URL helpers", () => {
  it("normalizes arXiv abstract and PDF links", () => {
    expect(normalizePdfUrl("https://arxiv.org/abs/2401.01234v2")).toBe(
      "https://arxiv.org/pdf/2401.01234v2.pdf",
    );
    expect(
      normalizePdfUrl("https://www.arxiv.org/pdf/2401.01234?download=1"),
    ).toBe("https://www.arxiv.org/pdf/2401.01234.pdf?download=1");
    expect(normalizePdfUrl("https://arxiv.org/abs/hep-th/9901001")).toBe(
      "https://arxiv.org/pdf/hep-th/9901001.pdf",
    );
  });

  it("recognizes PDF paths case-insensitively without mistaking query text", () => {
    expect(isPdfUrl("https://example.com/report.PDF?download=1")).toBe(true);
    expect(isPdfUrl("https://arxiv.org/pdf/2401.01234")).toBe(true);
    expect(isPdfUrl("https://arxiv.org/abs/2401.01234")).toBe(false);
    expect(isPdfUrl("https://example.com/view?file=report.pdf")).toBe(false);
    expect(isPdfUrl("file:///tmp/report.pdf")).toBe(false);
  });

  it("reads and encodes the reader file parameter", () => {
    expect(
      pdfUrlFromLocation({
        search: "?file=https%3A%2F%2Fexample.com%2Fa%20b.pdf",
      } as Location),
    ).toBe("https://example.com/a%20b.pdf");
    expect(
      pdfReaderUrl(
        "https://example.com/report.pdf?x=1&y=2",
        "chrome-extension://abc/src/pdf/index.html",
      ),
    ).toBe(
      "chrome-extension://abc/src/pdf/index.html?file=https%3A%2F%2Fexample.com%2Freport.pdf%3Fx%3D1%26y%3D2",
    );
  });
});
