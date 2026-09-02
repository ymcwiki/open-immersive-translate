import type { FeatureContext } from "./context";

const HOVER_DEBOUNCE_MS = 200;

function holdKeyMatches(
  holdKey: FeatureContext["config"]["hover"]["holdKey"],
  event: KeyboardEvent | MouseEvent,
): boolean {
  if (holdKey === "Alt") return event.altKey;
  if (holdKey === "Ctrl") return event.ctrlKey;
  return event.shiftKey;
}

function findBlock(
  target: Element,
  blockTags: ReadonlySet<string>,
): Element | null {
  let current: Element | null = target;
  while (current) {
    if (blockTags.has(current.tagName.toUpperCase())) return current;
    current = current.parentElement;
  }
  return null;
}

/** Install modifier-key hover translation. */
export function init(ctx: FeatureContext): () => void {
  if (!ctx.config.hover.enabled) return () => undefined;

  const blockTags = new Set(
    (ctx.rule.allBlockTags ?? []).map((tag) => tag.toUpperCase()),
  );
  const translated = new WeakSet<Element>();
  let held = false;
  let pending: Element | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearPending = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = null;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      (ctx.config.hover.holdKey === "Ctrl" && event.key === "Control") ||
      event.key === ctx.config.hover.holdKey
    ) {
      held = true;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (
      (ctx.config.hover.holdKey === "Ctrl" && event.key === "Control") ||
      event.key === ctx.config.hover.holdKey
    ) {
      held = false;
      clearPending();
    }
  };

  const onBlur = (): void => {
    held = false;
    clearPending();
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!held && !holdKeyMatches(ctx.config.hover.holdKey, event)) {
      clearPending();
      return;
    }

    const pointed =
      document.elementFromPoint?.(event.clientX, event.clientY) ?? event.target;
    if (!(pointed instanceof Element) || pointed.closest("[data-imt]")) {
      clearPending();
      return;
    }

    const container = findBlock(pointed, blockTags);
    if (
      !container ||
      container.closest("[data-imt]") ||
      translated.has(container)
    ) {
      clearPending();
      return;
    }
    if (pending === container) return;

    clearPending();
    pending = container;
    timer = setTimeout(() => {
      timer = undefined;
      const selected = pending;
      pending = null;
      if (
        !selected ||
        selected.closest("[data-imt]") ||
        translated.has(selected)
      ) {
        return;
      }
      translated.add(selected);
      void ctx.translateParagraph(selected).catch(() => undefined);
    }, HOVER_DEBOUNCE_MS);
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("blur", onBlur);

  return () => {
    clearPending();
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("blur", onBlur);
  };
}
