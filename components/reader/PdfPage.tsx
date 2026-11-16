"use client";
import { memo, useEffect, useRef } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { getPdfjs } from "@/lib/pdf/load";
import type { HighlightRect } from "@/lib/db/schema";

export type PageHighlight = { id: number; rects: HighlightRect[]; color?: string | null };

type Props = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number; // CSS px
  height: number; // CSS px
  scale: number; // CSS px per PDF point
  active: boolean; // near the viewport → render; otherwise just a placeholder
  highlights: PageHighlight[];
  /** Reports the page's real size at scale 1 if it differs from the guess. */
  onNaturalSize: (page: number, w: number, h: number) => void;
};

const MAX_CANVAS_PIXELS = 16_000_000; // iOS Safari canvas limit is ~16.7M

function PdfPageImpl({ pdf, pageNumber, width, height, scale, active, highlights, onNaturalSize }: Props) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) {
      canvasHost.current?.replaceChildren();
      textHost.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: { cancel(): void } | null = null;

    (async () => {
      const pdfjs = await getPdfjs();
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      onNaturalSize(pageNumber, natural.width, natural.height);

      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));

      // Render off-screen, then swap in, so zooming doesn't flash a blank page.
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.className = "pdf-canvas";
      renderTask = page.render({
        canvasContext: canvas.getContext("2d", { alpha: false })!,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      await renderTask.promise;
      if (cancelled) return;
      canvasHost.current?.replaceChildren(canvas);

      // Selectable text layer (for highlights and copy).
      const host = textHost.current;
      if (!host) return;
      const div = document.createElement("div");
      div.className = "textLayer";
      host.replaceChildren(div);
      const tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: div, viewport });
      textLayer = tl;
      await tl.render().catch(() => {});
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException") console.warn("page render failed", pageNumber, e);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, active, onNaturalSize]);

  return (
    <div
      data-page={pageNumber}
      className="pdf-page relative mx-auto bg-white shadow-sm"
      style={{ width, height, ["--scale-factor" as string]: scale }}
    >
      <div ref={canvasHost} className="absolute inset-0" />
      {highlights.map((h) =>
        h.rects.map((r, i) => (
          <div
            key={`${h.id}-${i}`}
            className="pointer-events-none absolute rounded-[2px] mix-blend-multiply"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              background: h.color || "rgb(253 224 71 / 0.55)",
            }}
          />
        )),
      )}
      <div ref={textHost} className="absolute inset-0" />
      {!active && (
        <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">{pageNumber}</div>
      )}
    </div>
  );
}

export const PdfPage = memo(PdfPageImpl);
