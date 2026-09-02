import { describe, expect, it } from "vitest";

import { readPdfConfig } from "../../src/pdf/config";
import type { Config } from "../../src/shared/types";

const base = {
  translationMode: "dual",
  theme: "paper",
} as Config;

describe("readPdfConfig", () => {
  it("falls back to the existing display configuration", () => {
    expect(readPdfConfig(base)).toEqual({
      interceptLinks: false,
      mode: "dual",
      theme: "paper",
    });
  });

  it("reads the requested PDF-specific schema without changing shared types", () => {
    const config = {
      ...base,
      pdf: { interceptLinks: true, mode: "translation", theme: "highlight" },
    } as Config;
    expect(readPdfConfig(config)).toEqual({
      interceptLinks: true,
      mode: "translation",
      theme: "highlight",
    });
  });
});
