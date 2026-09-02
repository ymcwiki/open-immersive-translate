export interface ViewportContainer {
  id: string;
  container: Element;
}

export type ViewportContainerInput =
  Element | ViewportContainer | readonly [id: string, container: Element];

export interface ViewportObserver {
  add(container: ViewportContainerInput, id?: string): void;
  remove(container: Element | string): void;
  disconnect(): void;
}

export interface ViewportObserverOptions {
  rootMargin?: string;
}

function isElement(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    value.nodeType === 1
  );
}

function normalizeContainer(
  input: ViewportContainerInput,
  explicitId?: string,
): ViewportContainer {
  if (isElement(input)) {
    const id = explicitId ?? input.getAttribute("data-imt-id") ?? input.id;
    if (!id) {
      throw new Error("A viewport container requires an id");
    }
    return { id, container: input };
  }
  if (Array.isArray(input)) {
    return { id: input[0], container: input[1] };
  }
  return input as ViewportContainer;
}

/** Observe paragraph containers and batch ids once they approach the viewport. */
export function observeViewport(
  containers: Iterable<ViewportContainerInput>,
  onVisible: (ids: string[]) => void,
  options: ViewportObserverOptions = {},
): ViewportObserver {
  const idsByElement = new Map<Element, string>();
  const visibleIds = new Set<string>();
  let idleHandle: number | undefined;
  let timerHandle: ReturnType<typeof setTimeout> | undefined;
  let disconnected = false;

  const flush = (): void => {
    idleHandle = undefined;
    timerHandle = undefined;
    if (disconnected || visibleIds.size === 0) {
      return;
    }
    const ids = [...visibleIds];
    visibleIds.clear();
    onVisible(ids);
  };

  const schedule = (): void => {
    if (idleHandle !== undefined || timerHandle !== undefined) {
      return;
    }
    if (typeof globalThis.requestIdleCallback === "function") {
      idleHandle = globalThis.requestIdleCallback(flush, { timeout: 100 });
    } else {
      timerHandle = setTimeout(flush, 100);
    }
  };

  const IntersectionObserverConstructor = globalThis.IntersectionObserver;
  const observer = IntersectionObserverConstructor
    ? new IntersectionObserverConstructor(
        (entries) => {
          let hasVisibleEntry = false;
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            const id = idsByElement.get(entry.target);
            if (!id) {
              continue;
            }
            visibleIds.add(id);
            hasVisibleEntry = true;
            observer?.unobserve(entry.target);
          }
          if (hasVisibleEntry) {
            schedule();
          }
        },
        { rootMargin: options.rootMargin ?? "100%" },
      )
    : null;

  const add = (input: ViewportContainerInput, id?: string): void => {
    if (disconnected) {
      return;
    }
    const normalized = normalizeContainer(input, id);
    idsByElement.set(normalized.container, normalized.id);
    if (observer) {
      observer.observe(normalized.container);
    } else {
      visibleIds.add(normalized.id);
      schedule();
    }
  };

  const remove = (containerOrId: Element | string): void => {
    for (const [container, id] of idsByElement) {
      if (containerOrId !== container && containerOrId !== id) {
        continue;
      }
      observer?.unobserve(container);
      idsByElement.delete(container);
      visibleIds.delete(id);
    }
  };

  const disconnect = (): void => {
    disconnected = true;
    observer?.disconnect();
    idsByElement.clear();
    visibleIds.clear();
    if (idleHandle !== undefined) {
      globalThis.cancelIdleCallback?.(idleHandle);
    }
    if (timerHandle !== undefined) {
      clearTimeout(timerHandle);
    }
    idleHandle = undefined;
    timerHandle = undefined;
  };

  for (const container of containers) {
    add(container);
  }

  return { add, remove, disconnect };
}
