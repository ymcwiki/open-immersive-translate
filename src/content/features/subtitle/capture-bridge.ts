import browser from "webextension-polyfill";

import type {
  SubtitleCapture,
  SubtitleCapturePattern,
} from "../../../shared/subtitle-types";
import mainWorldScript from "./main-world?script&iife";

const CONTENT_SOURCE = "imt-subtitle-content";
const MAIN_SOURCE = "imt-subtitle-main";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCapture(value: unknown): value is SubtitleCapture {
  return (
    isRecord(value) &&
    typeof value.adapterId === "string" &&
    typeof value.format === "string" &&
    typeof value.url === "string" &&
    typeof value.body === "string"
  );
}

/** Inject and configure the MAIN-world response interceptor. */
export function installCaptureBridge(
  patterns: readonly SubtitleCapturePattern[],
  onCapture: (capture: SubtitleCapture) => void,
): () => void {
  if (!patterns.length) return () => undefined;
  const script = document.createElement("script");
  script.dataset.imt = "subtitle-main";
  script.src = browser.runtime.getURL(mainWorldScript);

  const configure = (): void => {
    window.postMessage(
      { source: CONTENT_SOURCE, type: "configure", patterns },
      "*",
    );
    script.remove();
  };
  script.addEventListener("load", configure, { once: true });

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || !isRecord(event.data)) return;
    if (
      event.data.source === MAIN_SOURCE &&
      event.data.type === "captured" &&
      isCapture(event.data.capture)
    ) {
      onCapture(event.data.capture);
    }
  };
  window.addEventListener("message", onMessage);
  (document.head ?? document.documentElement).append(script);

  return () => {
    window.removeEventListener("message", onMessage);
    script.removeEventListener("load", configure);
    script.remove();
    window.postMessage({ source: CONTENT_SOURCE, type: "dispose" }, "*");
  };
}
