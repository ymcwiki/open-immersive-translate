export interface MutationObserverOptions {
  debounceMs?: number;
  excludeSelectors?: readonly string[];
}

function owningElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function isIgnored(node: Node, excludeSelectors: readonly string[]): boolean {
  const element = owningElement(node);
  if (!element) {
    return false;
  }
  if (element.matches("[data-imt]") || element.closest("[data-imt]")) {
    return true;
  }
  return excludeSelectors.some(
    (selector) =>
      element.matches(selector) || element.closest(selector) !== null,
  );
}

/** Observe page changes, excluding extension-owned and configured subtrees. */
export function observeMutations(
  root: Node,
  onChanged: (nodes: Node[]) => void,
  options: MutationObserverOptions = {},
): () => void {
  const debounceMs = options.debounceMs ?? 100;
  const excludeSelectors = options.excludeSelectors ?? [];
  const pending = new Set<Node>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    timer = undefined;
    if (pending.size === 0) {
      return;
    }
    const nodes = [...pending];
    pending.clear();
    onChanged(nodes);
  };

  const schedule = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, debounceMs);
  };

  const queue = (node: Node): void => {
    if (isIgnored(node, excludeSelectors)) {
      return;
    }
    for (const existing of pending) {
      if (existing === node || existing.contains(node)) {
        return;
      }
      if (node.contains(existing)) {
        pending.delete(existing);
      }
    }
    pending.add(node);
    schedule();
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (isIgnored(record.target, excludeSelectors)) {
        continue;
      }

      if (record.type === "characterData") {
        queue(record.target);
        continue;
      }

      for (const node of record.addedNodes) {
        queue(node);
      }

      if (
        record.addedNodes.length === 0 &&
        [...record.removedNodes].some(
          (node) => !isIgnored(node, excludeSelectors),
        )
      ) {
        queue(record.target);
      }
    }
  });

  observer.observe(root, {
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    pending.clear();
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}
