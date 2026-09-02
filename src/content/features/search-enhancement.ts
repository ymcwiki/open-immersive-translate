import { detectLang, isSameLang } from "../../shared/lang";
import type { LangCode } from "../../shared/types";
import type { FeatureContext } from "./context";
import {
  searchEnhancementLocale,
  searchEnhancementText,
} from "./search-enhancement-i18n";

export type SearchEngine = "google" | "bing" | "duckduckgo";

export interface SearchPage {
  engine: SearchEngine;
  query: string;
}

interface SearchEnhancementConfig {
  searchEnhancement?: { enabled?: boolean };
}

const generations = new WeakMap<Document, number>();
const HOST_SELECTOR = '[data-imt="search-enhancement"]';

function matchesHostname(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function matchesGoogleHostname(hostname: string): boolean {
  const match = hostname.match(/(?:^|\.)google\.([a-z.]+)$/i);
  if (!match) return false;
  const suffix = match[1]?.split(".") ?? [];
  return (
    suffix.length === 1 || (suffix.length === 2 && suffix[1]?.length === 2)
  );
}

/** Read a supported search engine and its current query from a result URL. */
export function getSearchPage(url: URL): SearchPage | null {
  const hostname = url.hostname.toLowerCase();
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) return null;

  if (matchesGoogleHostname(hostname) && url.pathname === "/search") {
    return { engine: "google", query };
  }
  if (matchesHostname(hostname, "bing.com") && url.pathname === "/search") {
    return { engine: "bing", query };
  }
  if (
    matchesHostname(hostname, "duckduckgo.com") &&
    (url.pathname === "/" ||
      url.pathname === "/html" ||
      url.pathname === "/html/")
  ) {
    return { engine: "duckduckgo", query };
  }
  return null;
}

/** Build a same-engine result URL for an English query. */
export function englishSearchUrl(
  page: SearchPage,
  currentUrl: URL,
  translatedQuery: string,
): string {
  const url = new URL(currentUrl.href);
  url.searchParams.set("q", translatedQuery);

  if (page.engine === "google") {
    url.searchParams.set("hl", "en");
    url.searchParams.delete("start");
  } else if (page.engine === "bing") {
    url.searchParams.set("setlang", "en");
    url.searchParams.delete("first");
  } else {
    url.searchParams.set("kl", "us-en");
    url.searchParams.delete("s");
    url.searchParams.delete("dc");
  }

  return url.href;
}

/** Return whether a query is written in the configured target language. */
export function isTargetLanguageQuery(
  query: string,
  targetLanguage: LangCode,
): boolean {
  if (targetLanguage === "auto" || targetLanguage === "en") return false;
  const detected = detectLang(query);
  if (detected !== "auto") return isSameLang(detected, targetLanguage);

  if (targetLanguage === "zh-CN" || targetLanguage === "zh-TW") {
    return /\p{Script=Han}/u.test(query);
  }
  if (targetLanguage === "ja") {
    return /\p{Script=Hiragana}|\p{Script=Katakana}/u.test(query);
  }
  if (targetLanguage === "ko") return /\p{Script=Hangul}/u.test(query);
  if (targetLanguage === "ru") return /\p{Script=Cyrillic}/u.test(query);
  if (targetLanguage === "ar") return /\p{Script=Arabic}/u.test(query);
  return false;
}

function mountPoint(doc: Document, engine: SearchEngine): Element | null {
  const selectors: Record<SearchEngine, string> = {
    google: "#search, #rso",
    bing: "#b_content, #b_results",
    duckduckgo: '[data-testid="mainline"], #links, .results',
  };
  return doc.querySelector(selectors[engine]) ?? doc.body;
}

function renderBar(
  doc: Document,
  page: SearchPage,
  currentUrl: URL,
  translatedQuery: string,
): HTMLElement | null {
  const point = mountPoint(doc, page.engine);
  if (!point) return null;

  const locale = searchEnhancementLocale(
    doc.documentElement.lang || navigator.language,
  );
  const host = doc.createElement("div");
  host.dataset.imt = "search-enhancement";
  const shadow = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = `
    :host { display: block; color-scheme: light dark; }
    aside {
      display: flex;
      align-items: center;
      gap: 10px;
      box-sizing: border-box;
      width: fit-content;
      max-width: min(100%, 720px);
      margin: 8px 0 14px;
      padding: 8px 12px;
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      border-radius: 8px;
      background: Canvas;
      color: CanvasText;
      box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
      font: 13px/1.4 system-ui, sans-serif;
    }
    span { color: color-mix(in srgb, currentColor 72%, transparent); }
    a { color: LinkText; font-weight: 600; overflow-wrap: anywhere; }
    @media (max-width: 560px) {
      aside { align-items: flex-start; flex-direction: column; gap: 3px; }
    }
  `;

  const bar = doc.createElement("aside");
  bar.setAttribute("aria-label", searchEnhancementText("label", locale));
  const prompt = doc.createElement("span");
  prompt.textContent = searchEnhancementText("prompt", locale);
  const link = doc.createElement("a");
  link.href = englishSearchUrl(page, currentUrl, translatedQuery);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = searchEnhancementText("link", locale, {
    query: translatedQuery,
  });

  bar.append(prompt, link);
  shadow.append(style, bar);
  point.prepend(host);
  return host;
}

/** Install the search-query enhancement for the current result page. */
export function init(ctx: FeatureContext): () => void {
  const doc = document;
  const generation = (generations.get(doc) ?? 0) + 1;
  generations.set(doc, generation);
  doc.querySelector(HOST_SELECTOR)?.remove();

  let host: HTMLElement | null = null;
  let disposed = false;
  const config = ctx.config as FeatureContext["config"] &
    SearchEnhancementConfig;
  const pageUrl = new URL(window.location.href);
  const page = getSearchPage(pageUrl);

  if (
    config.searchEnhancement?.enabled === true &&
    page &&
    isTargetLanguageQuery(page.query, ctx.config.targetLanguage)
  ) {
    void ctx
      .translateText(page.query, ctx.config.targetLanguage, "en")
      .then((translatedQuery) => {
        const translation = translatedQuery.trim();
        const currentPage = getSearchPage(new URL(window.location.href));
        if (
          disposed ||
          generations.get(doc) !== generation ||
          !translation ||
          translation === page.query ||
          currentPage?.engine !== page.engine ||
          currentPage.query !== page.query ||
          doc.querySelector(HOST_SELECTOR)
        ) {
          return;
        }
        host = renderBar(doc, page, pageUrl, translation);
      })
      .catch(() => undefined);
  }

  return () => {
    disposed = true;
    host?.remove();
    if (generations.get(doc) === generation) {
      generations.set(doc, generation + 1);
    }
  };
}
