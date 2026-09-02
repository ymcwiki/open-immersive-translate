import browser from "webextension-polyfill";

import { loadConfig } from "../shared/config";
import type { Config } from "../shared/types";
import { readPdfConfig } from "./config";
import { isPdfUrl, pdfReaderUrl } from "./url";

type HeadersReceivedDetails = Parameters<
  Parameters<typeof browser.webRequest.onHeadersReceived.addListener>[0]
>[0];

interface PdfInterceptorDependencies {
  getConfig?: () => Promise<Config>;
  getReaderBaseUrl?: () => string;
  updateTab?: (tabId: number, url: string) => Promise<unknown>;
}

export function isPdfContentType(
  headers: readonly { name?: string; value?: string }[] | undefined,
): boolean {
  return (
    headers?.some(
      ({ name, value }) =>
        name?.toLowerCase() === "content-type" &&
        value?.toLowerCase().split(";", 1)[0]?.trim() === "application/pdf",
    ) ?? false
  );
}

/** Register background listeners that redirect top-level PDFs to the reader. */
export function registerPdfInterception(
  dependencies: PdfInterceptorDependencies = {},
): () => void {
  const getConfig = dependencies.getConfig ?? loadConfig;
  const getReaderBaseUrl =
    dependencies.getReaderBaseUrl ??
    (() => browser.runtime.getURL("src/pdf/index.html"));
  const updateTab =
    dependencies.updateTab ??
    ((tabId, url) => browser.tabs.update(tabId, { url }));
  const redirecting = new Set<number>();

  const redirect = async (tabId: number, url: string): Promise<void> => {
    if (tabId < 0 || redirecting.has(tabId)) return;
    const readerBaseUrl = getReaderBaseUrl();
    if (url.startsWith(readerBaseUrl)) return;
    const config = await getConfig();
    if (!readPdfConfig(config).interceptLinks) return;

    redirecting.add(tabId);
    try {
      await updateTab(tabId, pdfReaderUrl(url, readerBaseUrl));
    } finally {
      redirecting.delete(tabId);
    }
  };

  const onUpdated = (
    tabId: number,
    changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
  ): void => {
    if (changeInfo.url && isPdfUrl(changeInfo.url)) {
      void redirect(tabId, changeInfo.url).catch(console.error);
    }
  };
  browser.tabs.onUpdated.addListener(onUpdated);

  const onHeadersReceived = (details: HeadersReceivedDetails): void => {
    if (
      details.type === "main_frame" &&
      isPdfContentType(details.responseHeaders)
    ) {
      void redirect(details.tabId, details.url).catch(console.error);
    }
  };

  let headersListenerRegistered = false;
  try {
    browser.webRequest.onHeadersReceived.addListener(
      onHeadersReceived,
      { urls: ["<all_urls>"], types: ["main_frame"] },
      ["responseHeaders"],
    );
    headersListenerRegistered = true;
  } catch {
    // URL-suffix interception still works without the optional webRequest permission.
  }

  return () => {
    browser.tabs.onUpdated.removeListener(onUpdated);
    if (headersListenerRegistered) {
      browser.webRequest.onHeadersReceived.removeListener(onHeadersReceived);
    }
  };
}

export const init = registerPdfInterception;
