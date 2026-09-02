const HOVER_DELAY_MS = 200;

function nearestBlock(target: Element, blockTags: ReadonlySet<string>): Element | null {
  let current: Element | null = target;
  while (current) {
    if (blockTags.has(current.tagName.toUpperCase())) return current;
    current = current.parentElement;
  }
  return null;
}

/** Install hover translation that does not require a modifier key. */
export function installDirectHoverTranslation(
  translate: (container: Element) => Promise<void>,
  blockTags: readonly string[],
): () => void {
  const blocks = new Set(blockTags.map((tag) => tag.toUpperCase()));
  const translated = new WeakSet<Element>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Element | null = null;

  const clear = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = null;
  };
  const onMove = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-imt]")) {
      clear();
      return;
    }
    const block = nearestBlock(target, blocks);
    if (!block || translated.has(block) || pending === block) return;
    clear();
    pending = block;
    timer = setTimeout(() => {
      const selected = pending;
      clear();
      if (!selected || translated.has(selected)) return;
      translated.add(selected);
      void translate(selected).catch(() => undefined);
    }, HOVER_DELAY_MS);
  };
  document.addEventListener("mousemove", onMove, true);
  return () => {
    clear();
    document.removeEventListener("mousemove", onMove, true);
  };
}
