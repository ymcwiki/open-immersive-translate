import browser from "webextension-polyfill";

export const TRANSLATION_OVERRIDES_KEY = "imt.translationOverrides.v1";

type OverrideSites = Record<string, Record<string, string>>;

export class TranslationOverrideStore {
  private values?: OverrideSites;
  private saveQueue = Promise.resolve();

  constructor(private readonly site: string) {}

  private async load(): Promise<OverrideSites> {
    if (!this.values) {
      const stored = await browser.storage.local.get(TRANSLATION_OVERRIDES_KEY);
      const value = stored[TRANSLATION_OVERRIDES_KEY];
      this.values =
        typeof value === "object" && value !== null
          ? (value as OverrideSites)
          : {};
    }
    return this.values;
  }

  async get(paragraphId: string): Promise<string | undefined> {
    return (await this.load())[this.site]?.[paragraphId];
  }

  async set(paragraphId: string, translation: string): Promise<void> {
    this.saveQueue = this.saveQueue.then(async () => {
      const values = await this.load();
      const siteValues = { ...(values[this.site] ?? {}), [paragraphId]: translation };
      this.values = { ...values, [this.site]: siteValues };
      await browser.storage.local.set({ [TRANSLATION_OVERRIDES_KEY]: this.values });
    });
    await this.saveQueue;
  }
}

export interface EditableTranslationOptions {
  enabled: boolean;
  save(paragraphId: string, translation: string): void | Promise<void>;
}

/** Make rendered translations editable on double click and persist on blur. */
export function installEditableTranslations(
  root: Document | Element,
  options: EditableTranslationOptions,
): () => void {
  if (!options.enabled) return () => undefined;
  let editing: HTMLElement | undefined;
  let original = "";

  const finish = (save: boolean): void => {
    if (!editing) return;
    const target = editing;
    if (!save) target.textContent = original;
    target.removeAttribute("contenteditable");
    target.removeAttribute("spellcheck");
    target.removeAttribute("data-imt-editing");
    editing = undefined;
    if (save) {
      const id = target.closest("[data-imt-id]")?.getAttribute("data-imt-id");
      if (id) void options.save(id, target.textContent ?? "");
    }
  };
  const onDoubleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const translation = target.closest<HTMLElement>('[data-imt="target"]');
    if (!translation) return;
    finish(true);
    editing = translation;
    original = translation.textContent ?? "";
    translation.contentEditable = "true";
    translation.spellcheck = false;
    translation.dataset.imtEditing = "true";
    translation.focus();
  };
  const onKeyDown = (event: Event): void => {
    if (!editing || !(event instanceof KeyboardEvent)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finish(true);
    }
  };
  const onFocusOut = (event: Event): void => {
    if (event.target === editing) finish(true);
  };

  root.addEventListener("dblclick", onDoubleClick);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("focusout", onFocusOut);
  return () => {
    finish(true);
    root.removeEventListener("dblclick", onDoubleClick);
    root.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("focusout", onFocusOut);
  };
}
