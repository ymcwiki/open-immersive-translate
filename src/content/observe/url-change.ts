interface UrlListener {
  callback: (url: string) => void;
  delayMs: number;
  lastUrl: string;
  timer?: ReturnType<typeof setTimeout>;
}

interface UrlController {
  listeners: Set<UrlListener>;
  originalPushState: History["pushState"];
  originalReplaceState: History["replaceState"];
  patchedPushState: History["pushState"];
  patchedReplaceState: History["replaceState"];
  notify: () => void;
}

const controllers = new WeakMap<Window, UrlController>();

function createController(win: Window): UrlController {
  const history = win.history;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const listeners = new Set<UrlListener>();

  const notify = (): void => {
    for (const listener of listeners) {
      if (listener.timer !== undefined) {
        clearTimeout(listener.timer);
      }
      listener.timer = setTimeout(() => {
        listener.timer = undefined;
        const url = win.location.href;
        if (url === listener.lastUrl) {
          return;
        }
        listener.lastUrl = url;
        listener.callback(url);
      }, listener.delayMs);
    }
  };

  const patchedPushState: History["pushState"] = function (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalPushState.call(history, data, unused, url);
    notify();
  };
  const patchedReplaceState: History["replaceState"] = function (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalReplaceState.call(history, data, unused, url);
    notify();
  };

  const controller: UrlController = {
    listeners,
    originalPushState,
    originalReplaceState,
    patchedPushState,
    patchedReplaceState,
    notify,
  };
  history.pushState = patchedPushState;
  history.replaceState = patchedReplaceState;
  win.addEventListener("popstate", notify);
  win.addEventListener("hashchange", notify);
  controllers.set(win, controller);
  return controller;
}

/** Subscribe to debounced history, popstate, and hash URL changes. */
export function onUrlChange(
  callback: (url: string) => void,
  delayMs = 500,
): () => void {
  const win = window;
  const controller = controllers.get(win) ?? createController(win);
  const listener: UrlListener = {
    callback,
    delayMs,
    lastUrl: win.location.href,
  };
  controller.listeners.add(listener);

  return () => {
    controller.listeners.delete(listener);
    if (listener.timer !== undefined) {
      clearTimeout(listener.timer);
    }
    if (controller.listeners.size > 0) {
      return;
    }

    win.removeEventListener("popstate", controller.notify);
    win.removeEventListener("hashchange", controller.notify);
    if (win.history.pushState === controller.patchedPushState) {
      win.history.pushState = controller.originalPushState;
    }
    if (win.history.replaceState === controller.patchedReplaceState) {
      win.history.replaceState = controller.originalReplaceState;
    }
    controllers.delete(win);
  };
}
