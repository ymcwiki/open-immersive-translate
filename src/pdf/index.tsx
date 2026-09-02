import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { render } from "preact";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import { LANGUAGE_CODES } from "../shared/lang";
import { loadConfig } from "../shared/config";
import type { Config, LangCode, TranslationMode } from "../shared/types";
import { readPdfConfig } from "./config";
import { fetchPdfFile, isPdfFile, readPdfFile } from "./file";
import {
  currentPdfLocale,
  pdfLanguageName,
  pdfServiceName,
  pdfT,
  sharedLabel,
} from "./i18n";
import { PdfPageView } from "./page";
import { PdfTranslationClient } from "./translation";
import type { PdfTranslationState, PositionedPdfParagraph } from "./types";
import { pdfUrlFromLocation } from "./url";
import "../content/render/themes.css";
import "./styles.css";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ReaderStatus {
  kind: "info" | "error" | "success";
  text: string;
}

interface TranslationSettings {
  config: Config;
  service: string;
  target: LangCode;
}

export function PdfReader(): preact.JSX.Element {
  const locale = currentPdfLocale();
  const [config, setConfig] = useState<Config>();
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const documentRef = useRef<PDFDocumentProxy>();
  const loadingTaskRef = useRef<PDFDocumentLoadingTask>();
  const [documentId, setDocumentId] = useState(0);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array>();
  const [filename, setFilename] = useState("document.pdf");
  const [service, setService] = useState("google");
  const [target, setTarget] = useState<LangCode>("zh-CN");
  const [mode, setMode] = useState<TranslationMode>("dual");
  const [theme, setTheme] = useState("underline");
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [eager, setEager] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<ReaderStatus>();
  const [pageParagraphs, setPageParagraphs] = useState(
    new Map<number, PositionedPdfParagraph[]>(),
  );
  const pageParagraphsRef = useRef(pageParagraphs);
  const [translations, setTranslations] = useState(
    new Map<string, PdfTranslationState>(),
  );
  const translatorRef = useRef<PdfTranslationClient>();
  const requestedRef = useRef(new Set<string>());
  const settingsRef = useRef<TranslationSettings>();
  const loadSequence = useRef(0);

  useEffect(() => {
    void loadConfig()
      .then((next) => {
        const pdf = readPdfConfig(next);
        setConfig(next);
        setService(next.service);
        setTarget(next.targetLanguage);
        setMode(pdf.mode);
        setTheme(pdf.theme);
      })
      .catch((cause: unknown) => {
        setStatus({ kind: "error", text: errorMessage(cause) });
      });
  }, []);

  useEffect(() => {
    if (!config) return;
    settingsRef.current = { config, service, target };
    translatorRef.current?.dispose();
    requestedRef.current.clear();
    setTranslations(new Map());
    const client = new PdfTranslationClient((results) => {
      setTranslations((current) => {
        const next = new Map(current);
        for (const result of results) {
          next.set(result.id, {
            text: result.text,
            error: result.error?.message,
            loading: false,
          });
        }
        return next;
      });
    });
    translatorRef.current = client;
    for (const paragraphs of pageParagraphsRef.current.values()) {
      requestTranslations(
        client,
        paragraphs,
        settingsRef.current,
        requestedRef.current,
        setTranslations,
      );
    }
    return () => {
      if (translatorRef.current === client) translatorRef.current = undefined;
      client.dispose();
    };
  }, [config, documentId, service, target]);

  useEffect(() => {
    const sourceUrl = pdfUrlFromLocation(window.location);
    if (!sourceUrl) return;
    void fetchPdfFile(sourceUrl)
      .then((bytes) => openPdf(bytes, filenameFromUrl(sourceUrl)))
      .catch((cause: unknown) => {
        setStatus({
          kind: "error",
          text: pdfT("loadFailed", { message: errorMessage(cause) }),
        });
      });
  }, []);

  useEffect(
    () => () => {
      translatorRef.current?.dispose();
      void loadingTaskRef.current?.destroy();
    },
    [],
  );

  const openPdf = useCallback(async (bytes: Uint8Array, name: string) => {
    const sequence = ++loadSequence.current;
    setStatus({ kind: "info", text: pdfT("loading") });
    setEager(false);
    setCurrentPage(1);
    setPageParagraphs(new Map());
    pageParagraphsRef.current = new Map();
    setTranslations(new Map());
    requestedRef.current.clear();
    translatorRef.current?.cancelAll();
    try {
      await loadingTaskRef.current?.destroy();
      const loadingTask = getDocument({ data: bytes.slice() });
      loadingTaskRef.current = loadingTask;
      const nextDocument = await loadingTask.promise;
      if (sequence !== loadSequence.current) {
        await loadingTask.destroy();
        return;
      }
      documentRef.current = nextDocument;
      setDocument(nextDocument);
      setOriginalBytes(bytes.slice());
      setFilename(name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`);
      setDocumentId((value) => value + 1);
      setStatus(undefined);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setDocument(undefined);
      setStatus({
        kind: "error",
        text: pdfT("loadFailed", { message: errorMessage(cause) }),
      });
    }
  }, []);

  const onPageReady = useCallback(
    (pageNumber: number, paragraphs: PositionedPdfParagraph[]) => {
      pageParagraphsRef.current = new Map(pageParagraphsRef.current).set(
        pageNumber,
        paragraphs,
      );
      setPageParagraphs(pageParagraphsRef.current);
      const settings = settingsRef.current;
      const client = translatorRef.current;
      if (client && settings) {
        requestTranslations(
          client,
          paragraphs,
          settings,
          requestedRef.current,
          setTranslations,
        );
      }
    },
    [],
  );

  const onVisible = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
  }, []);

  const serviceOptions = useMemo(() => {
    if (!config) return [];
    const entries = Object.entries(config.services);
    const enabled = entries.filter(
      ([id, value]) => value.enabled === true || id === service,
    );
    return (enabled.length ? enabled : entries).map(([id]) => ({
      id,
      label: pdfServiceName(id, locale),
    }));
  }, [config, locale, service]);

  const totalParagraphs = Array.from(pageParagraphs.values()).reduce(
    (count, paragraphs) => count + paragraphs.length,
    0,
  );
  const translatedParagraphs = Array.from(translations.values()).filter(
    ({ text }) => Boolean(text),
  ).length;

  const selectFile = async (file: File): Promise<void> => {
    if (!isPdfFile(file)) return;
    try {
      await openPdf(await readPdfFile(file), file.name);
    } catch (cause) {
      setStatus({
        kind: "error",
        text: pdfT("loadFailed", { message: errorMessage(cause) }),
      });
    }
  };

  const translateAll = (): void => {
    setEager(true);
    const client = translatorRef.current;
    const settings = settingsRef.current;
    if (!client || !settings) return;
    for (const paragraphs of pageParagraphs.values()) {
      requestTranslations(
        client,
        paragraphs,
        settings,
        requestedRef.current,
        setTranslations,
      );
    }
  };

  const download = async (): Promise<void> => {
    if (!document || !originalBytes) return;
    setEager(true);
    const allParagraphs = Array.from(pageParagraphs.values()).flat();
    const complete =
      pageParagraphs.size === document.numPages &&
      allParagraphs.length > 0 &&
      allParagraphs.every((paragraph) => translations.get(paragraph.id)?.text);
    if (!complete) {
      setStatus({ kind: "info", text: pdfT("exportWait") });
      return;
    }

    setStatus({ kind: "info", text: pdfT("exporting") });
    try {
      const { downloadPdf, exportBilingualPdf } = await import("./export");
      const bytes = await exportBilingualPdf(
        originalBytes,
        allParagraphs.map((paragraph) => ({
          ...paragraph,
          translation: translations.get(paragraph.id)?.text ?? "",
        })),
      );
      downloadPdf(bytes, bilingualFilename(filename));
      setStatus({ kind: "success", text: pdfT("exportReady") });
    } catch (cause) {
      setStatus({
        kind: "error",
        text: pdfT("exportFailed", { message: errorMessage(cause) }),
      });
    }
  };

  const goToPage = (page: number): void => {
    if (!document) return;
    const next = Math.min(document.numPages, Math.max(1, Math.round(page)));
    setCurrentPage(next);
    document
      .getPage(next)
      .then((pdfPage) => {
        const viewport = pdfPage.getViewport({ scale: zoom });
        const element = documentRef.current
          ? globalThis.document.getElementById(`pdf-page-${next}`)
          : undefined;
        element?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (element) {
          element.style.width = `${viewport.width}px`;
          element.style.minHeight = `${viewport.height}px`;
        }
      })
      .catch(console.error);
  };

  return (
    <main
      class={`pdf-reader${dragging ? " pdf-reader-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer?.files[0];
        if (file) void selectFile(file);
      }}
    >
      <header class="pdf-toolbar">
        <h1>{pdfT("title")}</h1>
        <label class="pdf-file-button">
          {pdfT("openFile")}
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void selectFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <div class="pdf-toolbar-group">
          <button
            type="button"
            aria-label={pdfT("previousPage")}
            disabled={!document || currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            ‹
          </button>
          <label>
            <span>{pdfT("page")}</span>
            <input
              type="number"
              min="1"
              max={document?.numPages ?? 1}
              value={currentPage}
              disabled={!document}
              onChange={(event) => goToPage(Number(event.currentTarget.value))}
            />
          </label>
          <span>{pdfT("pageCount", { count: document?.numPages ?? 0 })}</span>
          <button
            type="button"
            aria-label={pdfT("nextPage")}
            disabled={!document || currentPage >= document.numPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            ›
          </button>
        </div>
        <div class="pdf-toolbar-group">
          <button
            type="button"
            aria-label={pdfT("zoomOut")}
            disabled={!document || zoom <= 0.5}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label={pdfT("zoomIn")}
            disabled={!document || zoom >= 2.5}
            onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}
          >
            +
          </button>
        </div>
        <div
          class="pdf-segmented"
          role="group"
          aria-label={sharedLabel("popup.mode", locale)}
        >
          {(["dual", "translation"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {sharedLabel(
                value === "dual" ? "mode.dual" : "mode.translation",
                locale,
              )}
            </button>
          ))}
        </div>
        <label>
          <span>{pdfT("service")}</span>
          <select
            value={service}
            onChange={(event) => setService(event.currentTarget.value)}
          >
            {serviceOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{pdfT("targetLanguage")}</span>
          <select
            value={target}
            onChange={(event) =>
              setTarget(event.currentTarget.value as LangCode)
            }
          >
            {LANGUAGE_CODES.filter((code) => code !== "auto").map((code) => (
              <option key={code} value={code}>
                {pdfLanguageName(code, locale)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!document} onClick={translateAll}>
          {pdfT("translateAll")}
        </button>
        <button
          type="button"
          disabled={!document}
          onClick={() => void download()}
        >
          {pdfT("download")}
        </button>
      </header>

      <div class="pdf-progress" role="status">
        {status?.text ??
          (document
            ? pdfT("progress", {
                loaded: pageParagraphs.size,
                pages: document.numPages,
                translated: translatedParagraphs,
                paragraphs: totalParagraphs,
              })
            : pdfT("empty"))}
      </div>

      <div class="pdf-viewport">
        {document ? (
          Array.from({ length: document.numPages }, (_, index) => (
            <PdfPageView
              key={`${documentId}-${index + 1}`}
              document={document}
              documentId={documentId}
              pageNumber={index + 1}
              zoom={zoom}
              eager={eager}
              mode={mode}
              theme={theme}
              translations={translations}
              onReady={onPageReady}
              onVisible={onVisible}
            />
          ))
        ) : (
          <label class="pdf-empty-drop">
            <span>{dragging ? pdfT("dragActive") : pdfT("dropFile")}</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void selectFile(file);
              }}
            />
          </label>
        )}
      </div>
    </main>
  );
}

export function initPdfReader(root = document.getElementById("app")): void {
  if (root) render(<PdfReader />, root);
}

export const init = initPdfReader;

initPdfReader();

function requestTranslations(
  client: PdfTranslationClient,
  paragraphs: PositionedPdfParagraph[],
  settings: TranslationSettings,
  requested: Set<string>,
  setTranslations: (
    value: (
      current: Map<string, PdfTranslationState>,
    ) => Map<string, PdfTranslationState>,
  ) => void,
): void {
  const pending = paragraphs.filter(({ id }) => !requested.has(id));
  if (!pending.length) return;
  for (const paragraph of pending) requested.add(paragraph.id);
  setTranslations((current) => {
    const next = new Map(current);
    for (const paragraph of pending) {
      next.set(paragraph.id, { loading: true });
    }
    return next;
  });
  client.translate({
    paragraphs: pending.map(({ id, text }) => ({
      id,
      text,
      priority: "viewport",
    })),
    from: settings.config.sourceLanguage,
    to: settings.target,
    service: settings.service,
    glossary: settings.config.glossaries,
    context: { title: globalThis.document.title },
  });
}

function filenameFromUrl(value: string): string {
  const pathname = new URL(value).pathname;
  return decodeURIComponent(
    pathname.split("/").filter(Boolean).at(-1) ?? "document.pdf",
  );
}

function bilingualFilename(value: string): string {
  return value.replace(/\.pdf$/iu, "") + ".bilingual.pdf";
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
