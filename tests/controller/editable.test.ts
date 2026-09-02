import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));
const browserMock = vi.hoisted(() => ({
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storage.values[key] })),
      set: vi.fn(async (patch: Record<string, unknown>) => {
        Object.assign(storage.values, patch);
      }),
    },
  },
}));

vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import {
  installEditableTranslations,
  TranslationOverrideStore,
} from "../../src/content/controller/editable";

afterEach(() => {
  storage.values = {};
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe("editable translations", () => {
  it("edits on double click and saves the paragraph override", async () => {
    document.body.innerHTML =
      '<p data-imt-id="p1">Source<font data-imt="target">Old</font></p>';
    const save = vi.fn();
    const dispose = installEditableTranslations(document, { enabled: true, save });
    const target = document.querySelector<HTMLElement>('[data-imt="target"]')!;
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(target.contentEditable).toBe("true");
    target.textContent = "Edited";
    target.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(save).toHaveBeenCalledWith("p1", "Edited");
    expect(target.hasAttribute("contenteditable")).toBe(false);
    dispose();
  });

  it("stores overrides in separate per-site maps and reads them on reload", async () => {
    await new TranslationOverrideStore("docs.example").set("p1", "文档");
    await new TranslationOverrideStore("shop.example").set("p1", "商店");
    expect(await new TranslationOverrideStore("docs.example").get("p1")).toBe("文档");
    expect(await new TranslationOverrideStore("shop.example").get("p1")).toBe("商店");
  });
});
