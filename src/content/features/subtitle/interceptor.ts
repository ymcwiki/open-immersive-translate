import type {
  SubtitleCapture,
  SubtitleCapturePattern,
} from "../../../shared/subtitle-types";

const CONTENT_SOURCE = "imt-subtitle-content";
const MAIN_SOURCE = "imt-subtitle-main";
const INSTALLATION_KEY = "__imtSubtitleInterceptorDispose";
const MAX_CAPTURE_CHARS = 8_000_000;

interface CompiledPattern {
  definition: SubtitleCapturePattern;
  regex: RegExp;
}

type InterceptorWindow = Window &
  typeof globalThis & {
    [INSTALLATION_KEY]?: () => void;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function compileCapturePatterns(
  patterns: readonly SubtitleCapturePattern[],
): CompiledPattern[] {
  return patterns.flatMap((definition) => {
    try {
      return [{ definition, regex: new RegExp(definition.urlPattern, "i") }];
    } catch {
      return [];
    }
  });
}

export function matchCapturePatterns(
  url: string,
  patterns: readonly CompiledPattern[],
): SubtitleCapturePattern[] {
  return patterns.flatMap(({ definition, regex }) =>
    regex.test(url) ? [definition] : [],
  );
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string" || input instanceof URL) return String(input);
  return input.url;
}

/** Install a non-blocking fetch/XHR subtitle response tap in the page world. */
export function installMainWorldInterceptor(
  pageWindow: InterceptorWindow = window as InterceptorWindow,
): () => void {
  const installed = pageWindow[INSTALLATION_KEY];
  if (installed) return installed;

  let patterns: CompiledPattern[] = [];
  let disposed = false;
  const postCaptures = (url: string, body: string): void => {
    if (disposed || !body || body.length > MAX_CAPTURE_CHARS) return;
    for (const pattern of matchCapturePatterns(url, patterns)) {
      const capture: SubtitleCapture = {
        adapterId: pattern.adapterId,
        format: pattern.format,
        url,
        body,
      };
      pageWindow.postMessage(
        { source: MAIN_SOURCE, type: "captured", capture },
        "*",
      );
    }
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== pageWindow || !isRecord(event.data)) return;
    if (event.data.source !== CONTENT_SOURCE) return;
    if (event.data.type === "dispose") {
      dispose();
      return;
    }
    if (
      event.data.type !== "configure" ||
      !Array.isArray(event.data.patterns)
    ) {
      return;
    }
    patterns = compileCapturePatterns(
      event.data.patterns.filter(
        (value): value is SubtitleCapturePattern =>
          isRecord(value) &&
          typeof value.adapterId === "string" &&
          typeof value.urlPattern === "string" &&
          typeof value.format === "string",
      ),
    );
  };
  pageWindow.addEventListener("message", onMessage);

  const originalFetch = pageWindow.fetch;
  const patchedFetch: typeof pageWindow.fetch = async (input, init) => {
    const response = await Reflect.apply(originalFetch, pageWindow, [
      input,
      init,
    ]);
    const url = requestUrl(input);
    if (matchCapturePatterns(url, patterns).length) {
      void response
        .clone()
        .text()
        .then((body) => postCaptures(url, body))
        .catch(() => undefined);
    }
    return response;
  };
  if (typeof originalFetch === "function") pageWindow.fetch = patchedFetch;

  const xhrPrototype = pageWindow.XMLHttpRequest.prototype;
  const originalOpen = xhrPrototype.open;
  const originalSend = xhrPrototype.send;
  const urls = new WeakMap<XMLHttpRequest, string>();

  const patchedOpen: typeof xhrPrototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null,
  ): void {
    urls.set(this, String(url));
    Reflect.apply(originalOpen, this, [method, url, async, username, password]);
  };
  const patchedSend: typeof xhrPrototype.send = function (
    this: XMLHttpRequest,
    body?: XMLHttpRequestBodyInit | Document | null,
  ): void {
    const url = urls.get(this) ?? "";
    if (matchCapturePatterns(url, patterns).length) {
      this.addEventListener(
        "load",
        () => {
          try {
            const responseBody =
              this.responseType === "json"
                ? JSON.stringify(this.response)
                : typeof this.responseText === "string"
                  ? this.responseText
                  : "";
            postCaptures(url, responseBody);
          } catch {
            // Cross-origin or binary XHR responses may not expose text.
          }
        },
        { once: true },
      );
    }
    Reflect.apply(originalSend, this, [body]);
  };
  xhrPrototype.open = patchedOpen;
  xhrPrototype.send = patchedSend;

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pageWindow.removeEventListener("message", onMessage);
    if (pageWindow.fetch === patchedFetch) pageWindow.fetch = originalFetch;
    if (xhrPrototype.open === patchedOpen) xhrPrototype.open = originalOpen;
    if (xhrPrototype.send === patchedSend) xhrPrototype.send = originalSend;
    delete pageWindow[INSTALLATION_KEY];
  }

  pageWindow[INSTALLATION_KEY] = dispose;
  return dispose;
}
