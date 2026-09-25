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
  const idsByElement = new Map<Element, Set<string>>();
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
            const ids = idsByElement.get(entry.target);
            if (!ids?.size) {
              continue;
            }
            for (const id of ids) visibleIds.add(id);
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
    const ids = idsByElement.get(normalized.container) ?? new Set<string>();
    ids.add(normalized.id);
    idsByElement.set(normalized.container, ids);
    if (observer) {
      observer.observe(normalized.container);
    } else {
      visibleIds.add(normalized.id);
      schedule();
    }
  };

  const remove = (containerOrId: Element | string): void => {
    for (const [container, ids] of idsByElement) {
      if (
        containerOrId !== container &&
        (typeof containerOrId !== "string" || !ids.has(containerOrId))
      ) {
        continue;
      }
      if (containerOrId === container) {
        for (const id of ids) visibleIds.delete(id);
        ids.clear();
      } else if (typeof containerOrId === "string") {
        ids.delete(containerOrId);
        visibleIds.delete(containerOrId);
      }
      if (ids.size === 0) {
        observer?.unobserve(container);
        idsByElement.delete(container);
      }
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
