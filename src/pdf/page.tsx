import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "preact/hooks";

import type { TranslationMode } from "../shared/types";
import { extractPdfParagraphs } from "./extract";
import { pdfT } from "./i18n";
import type { PdfTranslationState, PositionedPdfParagraph } from "./types";

interface PdfPageViewProps {
  document: PDFDocumentProxy;
  documentId: number;
  pageNumber: number;
  zoom: number;
  eager: boolean;
  mode: TranslationMode;
  theme: string;
  translations: ReadonlyMap<string, PdfTranslationState>;
  onReady: (pageNumber: number, paragraphs: PositionedPdfParagraph[]) => void;
  onVisible: (pageNumber: number) => void;
}

interface PageSize {
  width: number;
  height: number;
}

export function PdfPageView({
  document,
  documentId,
  pageNumber,
  zoom,
  eager,
  mode,
  theme,
  translations,
  onReady,
  onVisible,
}: PdfPageViewProps): preact.JSX.Element {
  const shellRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState<PageSize>({
    width: 612 * zoom,
    height: 792 * zoom,
  });
  const [paragraphs, setParagraphs] = useState<PositionedPdfParagraph[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = shellRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      onVisible(pageNumber);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisible(true);
        onVisible(pageNumber);
      },
      { rootMargin: "0px", threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onVisible, pageNumber]);

  useEffect(() => {
    if (!visible && !eager) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;

    void (async () => {
      try {
        setError(false);
        const page = await document.getPage(pageNumber);
        if (!active) return;
        const viewport = page.getViewport({ scale: zoom });
        setSize({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;
        const outputScale = Math.max(1, globalThis.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textContainer.replaceChildren();

        renderTask = page.render({
          canvas,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });
        const textContent = await page.getTextContent();
        if (!active) return;
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        });
        await Promise.all([renderTask.promise, textLayer.render()]);
        if (!active) return;

        const nextParagraphs = extractPdfParagraphs(textContent, viewport).map(
          (paragraph, index): PositionedPdfParagraph => ({
            ...paragraph,
            id: `pdf-${documentId}-${pageNumber}-${index + 1}`,
            pageNumber,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
          }),
        );
        setParagraphs(nextParagraphs);
        onReady(pageNumber, nextParagraphs);
      } catch (cause) {
        if (active && !isCancellation(cause)) setError(true);
      }
    })();

    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [document, documentId, eager, onReady, pageNumber, visible, zoom]);

  const safeTheme = theme.replace(/[^a-zA-Z0-9_-]/gu, "") || "none";

  return (
    <section
      ref={shellRef}
      id={`pdf-page-${pageNumber}`}
      class="pdf-page-shell"
      data-page-number={pageNumber}
      aria-label={`${pdfT("page")} ${pageNumber}`}
      style={{ width: size.width, height: size.height }}
    >
      <div
        class="pdf-page"
        style={{
          width: size.width,
          height: size.height,
          "--total-scale-factor": String(zoom),
        }}
      >
        <canvas ref={canvasRef} />
        <div
          ref={textLayerRef}
          class={`textLayer${mode === "translation" ? " pdf-source-hidden" : ""}`}
        />
        <div class="pdf-translation-layer">
          {paragraphs.map((paragraph) => {
            const translation = translations.get(paragraph.id);
            const top =
              mode === "dual"
                ? paragraph.bbox.y + paragraph.bbox.height + 2
                : paragraph.bbox.y;
            return (
              <div
                key={paragraph.id}
                class={`pdf-translation pdf-mode-${mode} imt-target imt-theme-${safeTheme}${translation?.loading ? " imt-loading" : ""}${translation?.error ? " imt-error" : ""}`}
                style={{
                  left: paragraph.bbox.x,
                  top,
                  width: Math.max(paragraph.bbox.width, 40),
                  minHeight:
                    mode === "translation" ? paragraph.bbox.height : undefined,
                  fontSize: Math.max(8, paragraph.fontSize * 0.78),
                }}
                title={translation?.error}
              >
                {translation?.text ??
                  (translation?.error
                    ? pdfT("pageFailed", { page: pageNumber })
                    : "")}
              </div>
            );
          })}
        </div>
        {!paragraphs.length && !error && (visible || eager) && (
          <p class="pdf-page-status">
            {pdfT("rendering", { page: pageNumber })}
          </p>
        )}
        {error && (
          <p class="pdf-page-status pdf-page-error">
            {pdfT("pageFailed", { page: pageNumber })}
          </p>
        )}
      </div>
    </section>
  );
}

function isCancellation(value: unknown): boolean {
  return (
    value instanceof Error &&
    (value.name === "RenderingCancelledException" ||
      value.name === "AbortException")
  );
}
