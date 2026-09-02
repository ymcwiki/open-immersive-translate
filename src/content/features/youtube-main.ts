const MAIN_SOURCE = "imt-youtube-main";
const CONTENT_SOURCE = "imt-youtube-content";
const TRANSLATION_TIMEOUT_MS = 8_000;
const INSTALLATION_KEY = "__imtYoutubeMainDispose";

interface TimedTextJson {
  events?: unknown[];
  [key: string]: unknown;
}

interface PendingTranslation {
  original: TimedTextJson;
  timer: number;
  resolve(payload: TimedTextJson): void;
}

interface XhrState {
  method: string;
  url: string;
  async: boolean;
  headers: Headers;
  controller?: AbortController;
  intercepted: boolean;
  completed: boolean;
  aborted: boolean;
  readyState: number;
  status: number;
  statusText: string;
  responseURL: string;
  responseText: string;
  response: unknown;
  responseHeaders?: Headers;
}

type InstalledWindow = Window &
  typeof globalThis & {
    [INSTALLATION_KEY]?: () => void;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimedTextJson(value: unknown): value is TimedTextJson {
  return isRecord(value) && Array.isArray(value.events);
}

/** Identify YouTube timed-text requests without accepting lookalike hosts or paths. */
export function isYouTubeTimedTextUrl(
  value: string | URL,
  base = window.location.href,
): boolean {
  try {
    const url = new URL(String(value), base);
    return (
      (url.hostname === "youtube.com" ||
        url.hostname.endsWith(".youtube.com")) &&
      url.pathname.includes("/api/timedtext")
    );
  } catch {
    return false;
  }
}

function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string" || input instanceof URL) return String(input);
  return input.url;
}

function responseHeadersText(headers: Headers): string {
  return Array.from(headers.entries())
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("");
}

/** Install fetch and XMLHttpRequest interception in the page's MAIN world. */
export function installYouTubeMainInterceptor(): () => void {
  const pageWindow = window as InstalledWindow;
  const existing = pageWindow[INSTALLATION_KEY];
  if (existing) return existing;

  const pending = new Map<string, PendingTranslation>();
  let disposed = false;

  const requestTranslation = (payload: TimedTextJson): Promise<TimedTextJson> =>
    new Promise((resolve) => {
      const id = crypto.randomUUID();
      const timer = window.setTimeout(() => {
        pending.delete(id);
        resolve(payload);
      }, TRANSLATION_TIMEOUT_MS);
      pending.set(id, { original: payload, timer, resolve });
      window.postMessage(
        { source: MAIN_SOURCE, type: "translate", id, payload },
        "*",
      );
    });

  const translateBody = async (body: string): Promise<string> => {
    try {
      const parsed: unknown = JSON.parse(body);
      if (!isTimedTextJson(parsed)) return body;
      return JSON.stringify(await requestTranslation(parsed));
    } catch {
      return body;
    }
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || !isRecord(event.data)) return;

    if (event.data.source === CONTENT_SOURCE && event.data.type === "dispose") {
      dispose();
      return;
    }
    if (
      event.data.source !== CONTENT_SOURCE ||
      event.data.type !== "translated" ||
      typeof event.data.id !== "string" ||
      !isTimedTextJson(event.data.payload)
    ) {
      return;
    }

    const item = pending.get(event.data.id);
    if (!item) return;
    pending.delete(event.data.id);
    window.clearTimeout(item.timer);
    item.resolve(event.data.payload);
  };

  window.addEventListener("message", onMessage);

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const response = await Reflect.apply(originalFetch, window, [
        input,
        init,
      ]);
      if (!isYouTubeTimedTextUrl(fetchUrl(input))) return response;

      const originalBody = await response.clone().text();
      const translatedBody = await translateBody(originalBody);
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(translatedBody, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }) as typeof window.fetch;
  }

  const xhrPrototype = XMLHttpRequest.prototype;
  const originalOpen = xhrPrototype.open;
  const originalSend = xhrPrototype.send;
  const originalAbort = xhrPrototype.abort;
  const originalSetRequestHeader = xhrPrototype.setRequestHeader;
  const originalGetResponseHeader = xhrPrototype.getResponseHeader;
  const originalGetAllResponseHeaders = xhrPrototype.getAllResponseHeaders;
  const xhrStates = new WeakMap<XMLHttpRequest, XhrState>();

  xhrPrototype.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ): void {
    xhrStates.set(this, {
      method,
      url: String(url),
      async,
      headers: new Headers(),
      intercepted: false,
      completed: false,
      aborted: false,
      readyState: XMLHttpRequest.OPENED,
      status: 0,
      statusText: "",
      responseURL: "",
      responseText: "",
      response: null,
    });
    Reflect.apply(originalOpen, this, [method, url, async, username, password]);
  } as typeof xhrPrototype.open;

  xhrPrototype.setRequestHeader = function patchedSetRequestHeader(
    name: string,
    value: string,
  ): void {
    xhrStates.get(this)?.headers.append(name, value);
    Reflect.apply(originalSetRequestHeader, this, [name, value]);
  };

  xhrPrototype.getResponseHeader = function patchedGetResponseHeader(
    name: string,
  ): string | null {
    const state = xhrStates.get(this);
    if (state?.intercepted) return state.responseHeaders?.get(name) ?? null;
    return Reflect.apply(originalGetResponseHeader, this, [name]);
  };

  xhrPrototype.getAllResponseHeaders =
    function patchedGetAllResponseHeaders(): string {
      const state = xhrStates.get(this);
      if (state?.intercepted) {
        return state.responseHeaders
          ? responseHeadersText(state.responseHeaders)
          : "";
      }
      return Reflect.apply(originalGetAllResponseHeaders, this, []);
    };

  const dispatchReadyState = (
    xhr: XMLHttpRequest,
    state: XhrState,
    readyState: number,
  ): void => {
    state.readyState = readyState;
    xhr.dispatchEvent(new Event("readystatechange"));
  };

  const virtualizeResponse = (
    xhr: XMLHttpRequest,
    state: XhrState,
  ): boolean => {
    try {
      for (const key of [
        "readyState",
        "status",
        "statusText",
        "responseURL",
        "responseText",
        "response",
      ] as const) {
        Object.defineProperty(xhr, key, {
          configurable: true,
          get: () => state[key],
        });
      }
      return true;
    } catch {
      return false;
    }
  };

  const completeXhr = async (
    xhr: XMLHttpRequest,
    state: XhrState,
    body: XMLHttpRequestBodyInit | Document | null | undefined,
  ): Promise<void> => {
    try {
      state.controller = new AbortController();
      const requestBody =
        body instanceof Document
          ? new XMLSerializer().serializeToString(body)
          : body;
      const response = await Reflect.apply(originalFetch, window, [
        state.url,
        {
          method: state.method,
          headers: state.headers,
          body: /^(GET|HEAD)$/i.test(state.method) ? undefined : requestBody,
          credentials: xhr.withCredentials ? "include" : "same-origin",
          signal: state.controller.signal,
        } satisfies RequestInit,
      ]);
      const originalBody = await response.text();
      if (state.aborted || disposed) return;
      const translatedBody = await translateBody(originalBody);
      if (state.aborted || disposed) return;

      state.status = response.status;
      state.statusText = response.statusText;
      state.responseURL = response.url || state.url;
      state.responseHeaders = response.headers;
      state.responseText = translatedBody;
      state.response =
        xhr.responseType === "json"
          ? JSON.parse(translatedBody)
          : xhr.responseType === "arraybuffer"
            ? new TextEncoder().encode(translatedBody).buffer
            : xhr.responseType === "blob"
              ? new Blob([translatedBody], {
                  type:
                    response.headers.get("content-type") ?? "application/json",
                })
              : translatedBody;
      dispatchReadyState(xhr, state, XMLHttpRequest.HEADERS_RECEIVED);
      dispatchReadyState(xhr, state, XMLHttpRequest.LOADING);
      state.completed = true;
      dispatchReadyState(xhr, state, XMLHttpRequest.DONE);
      xhr.dispatchEvent(new ProgressEvent("load"));
      xhr.dispatchEvent(new ProgressEvent("loadend"));
    } catch (error) {
      if (
        state.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      state.completed = true;
      state.readyState = XMLHttpRequest.DONE;
      xhr.dispatchEvent(new ProgressEvent("error"));
      xhr.dispatchEvent(new ProgressEvent("loadend"));
    }
  };

  xhrPrototype.send = function patchedSend(
    body?: XMLHttpRequestBodyInit | Document | null,
  ): void {
    const state = xhrStates.get(this);
    if (
      !state ||
      !state.async ||
      typeof originalFetch !== "function" ||
      !isYouTubeTimedTextUrl(state.url)
    ) {
      Reflect.apply(originalSend, this, [body]);
      return;
    }

    state.intercepted = true;
    if (!virtualizeResponse(this, state)) {
      state.intercepted = false;
      Reflect.apply(originalSend, this, [body]);
      return;
    }
    this.dispatchEvent(new ProgressEvent("loadstart"));
    void completeXhr(this, state, body);
  };

  xhrPrototype.abort = function patchedAbort(): void {
    const state = xhrStates.get(this);
    if (!state?.intercepted || state.completed) {
      Reflect.apply(originalAbort, this, []);
      return;
    }
    state.aborted = true;
    state.controller?.abort();
    state.readyState = XMLHttpRequest.UNSENT;
    this.dispatchEvent(new ProgressEvent("abort"));
    this.dispatchEvent(new ProgressEvent("loadend"));
  };

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("message", onMessage);
    for (const item of pending.values()) {
      window.clearTimeout(item.timer);
      item.resolve(item.original);
    }
    pending.clear();
    if (typeof originalFetch === "function") window.fetch = originalFetch;
    xhrPrototype.open = originalOpen;
    xhrPrototype.send = originalSend;
    xhrPrototype.abort = originalAbort;
    xhrPrototype.setRequestHeader = originalSetRequestHeader;
    xhrPrototype.getResponseHeader = originalGetResponseHeader;
    xhrPrototype.getAllResponseHeaders = originalGetAllResponseHeaders;
    delete pageWindow[INSTALLATION_KEY];
  }

  pageWindow[INSTALLATION_KEY] = dispose;
  return dispose;
}

installYouTubeMainInterceptor();
