"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractChapters, openBook } from "@/lib/pdf/load";
import {
  beacon,
  flushQueue,
  localToday,
  pendingProgress,
  saveProgress,
  saveSession,
  type SessionPayload,
} from "@/lib/progress-client";
import { addNote, deleteNote, saveBookMeta, toggleChapter } from "@/app/actions";
import type { HighlightRect } from "@/lib/db/schema";
import { PdfPage, type PageHighlight } from "./PdfPage";
import { Sheet } from "./Sheet";
import { NotesPanel, type ClientNote, type NoteDraft } from "./NotesPanel";
import { ChaptersPanel, type ClientChapter } from "./ChaptersPanel";

export type ReaderBook = {
  id: number;
  title: string;
  sha: string;
  size: number;
  pageCount: number | null;
  outlineSeeded: boolean;
};

type Pos = { page: number; offset: number };
type Theme = "light" | "sepia" | "dark";

const GAP = 12;
const READ_LINE = 0.25; // the "current page" is the one crossing 25% down the screen
const DWELL_MS = 4000; // a page counts as read after 4 s on screen
const NEW_SESSION_AFTER_MS = 5 * 60_000;

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export function Reader({
  book,
  initial,
  jumpTo,
  chapters,
  notes: initialNotes,
}: {
  book: ReaderBook;
  initial: Pos & { updatedAt: string | null };
  jumpTo: number | null;
  chapters: ClientChapter[];
  notes: ClientNote[];
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const sizes = useRef(new Map<number, { w: number; h: number }>());
  const [sizesVersion, setSizesVersion] = useState(0);
  const [containerW, setContainerW] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [zoom, setZoom] = useState(() => Number(ls.get(`zoom:${book.id}`)) || 1);
  const [theme, setTheme] = useState<Theme>(() => (ls.get("reader-theme") as Theme) || "light");
  const [ui, setUi] = useState(true);
  const [sheet, setSheet] = useState<null | "notes" | "chapters" | "jump">(null);
  const [current, setCurrent] = useState<Pos>({ page: initial.page, offset: initial.offset });
  const currentRef = useRef(current);
  const [active, setActive] = useState<[number, number]>([1, 3]);
  const [restored, setRestored] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [covered, setCovered] = useState(() => new Set(chapters.filter((c) => c.covered).map((c) => c.id)));
  const [selection, setSelection] = useState<null | { page: number; quote: string }>(null);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [pinch, setPinch] = useState(1);
  const numPages = pdf?.numPages ?? 0;

  useEffect(() => setNotes(initialNotes), [initialNotes]);
  useEffect(() => setCovered(new Set(chapters.filter((c) => c.covered).map((c) => c.id))), [chapters]);

  /* ---------- Open the PDF (range requests only) ---------- */
  useEffect(() => {
    let doc: PDFDocumentProxy | null = null;
    let cancelled = false;
    openBook(book, { onError: (e) => setError(`Couldn't load part of the book: ${e.message}`) })
      .then(async (d) => {
        if (cancelled) return d.destroy();
        doc = d;
        const p1 = await d.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        setBase({ w: vp.width, h: vp.height });
        setPdf(d);

        // First open on any device: store page count + chapters from the PDF outline.
        if (!book.outlineSeeded || book.pageCount !== d.numPages) {
          const [chs, meta] = await Promise.all([
            book.outlineSeeded ? Promise.resolve(undefined) : extractChapters(d),
            d.getMetadata().catch(() => null),
          ]);
          const author = (meta?.info as { Author?: string } | undefined)?.Author;
          await saveBookMeta(book.id, { pageCount: d.numPages, author, chapters: chs });
          router.refresh();
        }
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Couldn't open this PDF"));
    return () => {
      cancelled = true;
      doc?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.sha]);

  /* ---------- Layout ---------- */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerW(el.clientWidth);
      setViewportH(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!base || !numPages || !containerW) return null;
    const pad = containerW < 640 ? 0 : 24;
    const scale = (Math.min(containerW - pad * 2, 1100) / base.w) * zoom;
    const tops: number[] = [];
    const dims: { w: number; h: number }[] = [];
    let y = GAP;
    let maxW = 0;
    for (let i = 1; i <= numPages; i++) {
      const s = sizes.current.get(i) ?? base;
      const d = { w: Math.floor(s.w * scale), h: Math.floor(s.h * scale) };
      tops.push(y);
      dims.push(d);
      y += d.h + GAP;
      maxW = Math.max(maxW, d.w);
    }
    return { scale, tops, dims, total: y, maxW };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, numPages, containerW, zoom, sizesVersion]);

  const scrollTopFor = useCallback(
    (p: Pos) => {
      if (!layout) return 0;
      const i = Math.min(Math.max(p.page, 1), numPages) - 1;
      return layout.tops[i] + p.offset * layout.dims[i].h - viewportH * READ_LINE;
    },
    [layout, numPages, viewportH],
  );

  const pageAt = useCallback(
    (y: number) => {
      if (!layout) return 0;
      let lo = 0;
      let hi = layout.tops.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (layout.tops[mid] <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    },
    [layout],
  );

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el || !layout) return;
    const y = el.scrollTop + el.clientHeight * READ_LINE;
    const i = pageAt(y);
    const offset = Math.min(1, Math.max(0, (y - layout.tops[i]) / layout.dims[i].h));
    const next = { page: i + 1, offset: Math.round(offset * 1000) / 1000 };
    const prev = currentRef.current;
    if (next.page !== prev.page || Math.abs(next.offset - prev.offset) > 0.01) {
      currentRef.current = next;
      setCurrent(next);
    }
    const from = pageAt(el.scrollTop - el.clientHeight) + 1;
    const to = pageAt(el.scrollTop + el.clientHeight * 2) + 1;
    setActive((a) => (a[0] === from && a[1] === to ? a : [from, to]));
  }, [layout, pageAt]);

  // Restore position once, then keep the reading position anchored when layout changes
  // (zoom, rotation, a page turning out to have a different size).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !layout || !viewportH) return;
    if (!restored) {
      (async () => {
        let target: Pos = { page: initial.page, offset: initial.offset };
        const local = await pendingProgress(book.id);
        if (local && (!initial.updatedAt || local.updatedAt > initial.updatedAt)) target = local;
        if (jumpTo) target = { page: jumpTo, offset: 0 };
        currentRef.current = target;
        setCurrent(target);
        el.scrollTop = scrollTopFor(target);
        setRestored(true);
        measure();
      })();
      return;
    }
    el.scrollTop = scrollTopFor(currentRef.current);
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, viewportH]);

  const onScroll = useRef(0);
  const handleScroll = () => {
    cancelAnimationFrame(onScroll.current);
    onScroll.current = requestAnimationFrame(measure);
  };

  const pendingSizes = useRef(0);
  const onNaturalSize = useCallback(
    (page: number, w: number, h: number) => {
      if (!base) return;
      const known = sizes.current.get(page) ?? base;
      if (Math.abs(known.w - w) < 1 && Math.abs(known.h - h) < 1) return;
      sizes.current.set(page, { w, h });
      cancelAnimationFrame(pendingSizes.current);
      pendingSizes.current = requestAnimationFrame(() => setSizesVersion((v) => v + 1));
    },
    [base],
  );

  const goTo = useCallback(
    (page: number, offset = 0) => {
      const p = { page: Math.min(Math.max(1, page), numPages || 1), offset };
      currentRef.current = p;
      setCurrent(p);
      if (scroller.current) scroller.current.scrollTop = scrollTopFor(p);
      measure();
    },
    [numPages, scrollTopFor, measure],
  );

  /* ---------- Progress saving ---------- */
  const progressPayload = useCallback(
    () => ({ ...currentRef.current, updatedAt: new Date().toISOString() }),
    [],
  );

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => saveProgress(book.id, progressPayload()), 1500);
    return () => clearTimeout(t);
  }, [current, restored, book.id, progressPayload]);

  // Auto-tick chapters locally as you pass them (the server does the same on save).
  useEffect(() => {
    const passed = chapters.filter((c) => c.endPage < current.page && !covered.has(c.id));
    if (passed.length) setCovered((s) => new Set([...s, ...passed.map((c) => c.id)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.page, chapters]);

  /* ---------- Reading sessions (streaks/stats) ---------- */
  const session = useRef<{ id: string; localDate: string; startedAt: number; startPage: number; pages: Set<number> } | null>(null);
  const startSession = useCallback(() => {
    session.current = {
      id: crypto.randomUUID(),
      localDate: localToday(),
      startedAt: Date.now(),
      startPage: currentRef.current.page,
      pages: new Set(),
    };
  }, []);
  const sessionPayload = useCallback((): SessionPayload | undefined => {
    const s = session.current;
    if (!s) return;
    return {
      id: s.id,
      localDate: s.localDate,
      startedAt: new Date(s.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      startPage: s.startPage,
      endPage: currentRef.current.page,
      pagesRead: s.pages.size,
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (!session.current) startSession();
    const t = setTimeout(() => session.current?.pages.add(current.page), DWELL_MS);
    return () => clearTimeout(t);
  }, [current.page, restored, startSession]);

  useEffect(() => {
    if (!restored) return;
    const tick = setInterval(() => {
      const s = sessionPayload();
      if (s && Date.now() - session.current!.startedAt > 60_000) saveSession(book.id, s);
    }, 60_000);

    let hiddenAt = 0;
    const onHide = () => {
      beacon(book.id, progressPayload(), sessionPayload());
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        onHide();
      } else {
        if (hiddenAt && Date.now() - hiddenAt > NEW_SESSION_AFTER_MS) startSession();
        flushQueue();
      }
    };
    const onOnline = () => flushQueue();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    flushQueue();
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
      // Leaving the reader inside the app (client navigation): save immediately.
      saveProgress(book.id, progressPayload(), true);
      const s = sessionPayload();
      if (s) saveSession(book.id, s, true);
    };
  }, [restored, book.id, progressPayload, sessionPayload, startSession]);

  /* ---------- Keep the screen on while reading ---------- */
  useEffect(() => {
    type WakeLock = { release(): Promise<void> };
    let lock: WakeLock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLock> } };
    const acquire = () => {
      if (document.visibilityState === "visible") nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  /* ---------- Zoom (buttons, ctrl+wheel, pinch) ---------- */
  const setZoomSaved = useCallback(
    (z: number) => {
      const v = Math.round(Math.min(4, Math.max(0.5, z)) * 100) / 100;
      setZoom(v);
      ls.set(`zoom:${book.id}`, String(v));
    },
    [book.id],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let startDist = 0;
    let ratio = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        ratio = 1;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist) {
        e.preventDefault();
        ratio = Math.min(4 / zoom, Math.max(0.5 / zoom, dist(e.touches) / startDist));
        setPinch(ratio);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (startDist && e.touches.length < 2) {
        startDist = 0;
        setPinch(1);
        if (Math.abs(ratio - 1) > 0.03) setZoomSaved(zoom * ratio);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoomSaved(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [zoom, setZoomSaved]);

  /* ---------- Text selection → highlight / note ---------- */
  useEffect(() => {
    let t = 0;
    const onSel = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        const sel = window.getSelection();
        const quote = sel?.toString().trim() ?? "";
        if (!sel || sel.isCollapsed || !quote || sel.rangeCount === 0) return setSelection(null);
        const node = sel.getRangeAt(0).startContainer;
        const el = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-page]");
        if (!el || !scroller.current?.contains(el)) return setSelection(null);
        setSelection({ page: Number(el.dataset.page), quote });
      }, 150);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const selectionRects = (page: number): HighlightRect[] => {
    const sel = window.getSelection();
    const pageEl = scroller.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!sel || !sel.rangeCount || !pageEl) return [];
    const box = pageEl.getBoundingClientRect();
    const out: HighlightRect[] = [];
    for (const r of Array.from(sel.getRangeAt(0).getClientRects())) {
      const x1 = Math.max(r.left, box.left);
      const y1 = Math.max(r.top, box.top);
      const x2 = Math.min(r.right, box.right);
      const y2 = Math.min(r.bottom, box.bottom);
      if (x2 - x1 < 2 || y2 - y1 < 2) continue;
      out.push({
        x: (x1 - box.left) / box.width,
        y: (y1 - box.top) / box.height,
        w: (x2 - x1) / box.width,
        h: (y2 - y1) / box.height,
      });
    }
    return out.slice(0, 200);
  };

  const toClient = (n: Awaited<ReturnType<typeof addNote>>): ClientNote => ({
    ...n,
    rects: n.rects ?? null,
    createdAt: new Date(n.createdAt).toISOString(),
  });

  const saveHighlight = async (withNote: boolean) => {
    if (!selection) return;
    const rects = selectionRects(selection.page);
    const quote = selection.quote;
    const page = selection.page;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    if (withNote) {
      setDraft({ page, quote, rects });
      setSheet("notes");
      return;
    }
    const n = await addNote(book.id, { page, kind: "highlight", quote, rects });
    setNotes((ns) => [...ns, toClient(n)]);
  };

  const saveDraft = async (text: string) => {
    if (!draft) return;
    const n = await addNote(book.id, {
      page: draft.page,
      kind: draft.rects?.length ? "highlight" : "note",
      text,
      quote: draft.quote,
      rects: draft.rects,
    });
    setNotes((ns) => [...ns, toClient(n)]);
    setDraft(null);
  };

  const removeNote = async (id: number) => {
    setNotes((ns) => ns.filter((n) => n.id !== id));
    await deleteNote(book.id, id);
  };

  const bookmarkHere = notes.find((n) => n.kind === "bookmark" && n.page === current.page);
  const toggleBookmark = async () => {
    if (bookmarkHere) return removeNote(bookmarkHere.id);
    const n = await addNote(book.id, { page: current.page, kind: "bookmark" });
    setNotes((ns) => [...ns, toClient(n)]);
  };

  const highlightsByPage = useMemo(() => {
    const m = new Map<number, PageHighlight[]>();
    for (const n of notes) {
      if (n.kind !== "highlight" || !n.rects?.length) continue;
      const list = m.get(n.page) ?? [];
      list.push({ id: n.id, rects: n.rects, color: n.color });
      m.set(n.page, list);
    }
    return m;
  }, [notes]);

  const onToggleChapter = async (id: number, value: boolean) => {
    setCovered((s) => {
      const next = new Set(s);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
    await toggleChapter(book.id, id, value);
  };

  const setThemeSaved = () => {
    const next: Theme = theme === "light" ? "sepia" : theme === "sepia" ? "dark" : "light";
    setTheme(next);
    ls.set("reader-theme", next);
  };

  const currentChapter = [...chapters].reverse().find((c) => c.startPage <= current.page);
  const pct = numPages ? Math.round((current.page / numPages) * 100) : 0;

  /* ---------- Render ---------- */
  return (
    <div className={`reader reader-${theme} fixed inset-0 flex flex-col`}>
      {/* Top bar */}
      <header
        className={`reader-bar absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-2 pt-[env(safe-area-inset-top)] transition-transform ${ui ? "" : "-translate-y-full"}`}
      >
        <Link href={`/book/${book.id}`} className="rounded-lg p-2 hover:bg-black/10" aria-label="Back to book">
          ←
        </Link>
        <div className="min-w-0 flex-1 py-2">
          <div className="truncate text-sm font-medium">{book.title}</div>
          {currentChapter && <div className="truncate text-xs opacity-70">{currentChapter.title}</div>}
        </div>
        <button onClick={() => setSheet("jump")} className="rounded-lg px-2 py-1 text-sm tabular-nums hover:bg-black/10">
          {current.page} / {numPages || "…"}
        </button>
      </header>

      {/* Pages */}
      <div
        ref={scroller}
        onScroll={handleScroll}
        onClick={(e) => {
          if (window.getSelection()?.toString()) return;
          if ((e.target as HTMLElement).closest("button,a,input")) return;
          setUi((v) => !v);
        }}
        className="reader-scroll relative flex-1 overflow-auto overscroll-contain"
        style={{ touchAction: "pan-x pan-y" }}
      >
        {error && (
          <div className="mx-auto mt-24 max-w-sm rounded-xl bg-red-50 p-4 text-sm text-red-800">
            {error}
            <button onClick={() => location.reload()} className="mt-3 block font-medium underline">
              Retry
            </button>
          </div>
        )}
        {!pdf && !error && (
          <div className="mt-32 text-center text-sm opacity-60">Opening {book.title}…</div>
        )}
        {pdf && layout && (
          <div
            style={{
              height: layout.total,
              width: Math.max(layout.maxW + 16, containerW),
              transform: pinch !== 1 ? `scale(${pinch})` : undefined,
              transformOrigin: `50% ${(scroller.current?.scrollTop ?? 0) + viewportH / 2}px`,
            }}
            className="relative"
          >
            {layout.tops.map((top, i) => {
              const n = i + 1;
              return (
                <div key={n} className="absolute inset-x-0" style={{ top }}>
                  <PdfPage
                    pdf={pdf}
                    pageNumber={n}
                    width={layout.dims[i].w}
                    height={layout.dims[i].h}
                    scale={layout.scale}
                    active={n >= active[0] && n <= active[1]}
                    highlights={highlightsByPage.get(n) ?? EMPTY}
                    onNaturalSize={onNaturalSize}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection actions */}
      {selection && (
        <div className="absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <div className="flex gap-1 rounded-full bg-neutral-900 p-1 text-sm text-white shadow-lg">
            <button onClick={() => saveHighlight(false)} className="rounded-full px-4 py-2 hover:bg-white/15">
              Highlight
            </button>
            <button onClick={() => saveHighlight(true)} className="rounded-full px-4 py-2 hover:bg-white/15">
              Highlight + note
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <footer
        className={`reader-bar absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 transition-transform ${ui ? "" : "translate-y-full"}`}
      >
        <div className="mb-1 flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={Math.max(1, numPages)}
            value={current.page}
            onChange={(e) => goTo(Number(e.target.value))}
            className="flex-1 accent-current"
            aria-label="Page"
          />
          <span className="w-10 text-right text-xs tabular-nums opacity-70">{pct}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <ToolButton label="Chapters" onClick={() => setSheet("chapters")}>☰</ToolButton>
          <ToolButton label="Notes" onClick={() => setSheet("notes")}>✎</ToolButton>
          <ToolButton label={bookmarkHere ? "Remove bookmark" : "Bookmark"} onClick={toggleBookmark}>
            {bookmarkHere ? "★" : "☆"}
          </ToolButton>
          <ToolButton label="Zoom out" onClick={() => setZoomSaved(zoom / 1.2)}>−</ToolButton>
          <button
            onClick={() => setZoomSaved(1)}
            className="w-12 rounded-lg py-2 text-xs tabular-nums hover:bg-black/10"
            aria-label="Fit width"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton label="Zoom in" onClick={() => setZoomSaved(zoom * 1.2)}>+</ToolButton>
          <ToolButton label={`Theme: ${theme}`} onClick={setThemeSaved}>◐</ToolButton>
        </div>
      </footer>

      <Sheet open={sheet === "jump"} title="Go to page" onClose={() => setSheet(null)}>
        <form
          className="flex gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(new FormData(e.currentTarget).get("page"));
            if (v) goTo(v);
            setSheet(null);
          }}
        >
          <input
            name="page"
            type="number"
            inputMode="numeric"
            min={1}
            max={numPages}
            defaultValue={current.page}
            autoFocus
            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2"
          />
          <button className="rounded-lg bg-accent px-4 py-2 font-medium text-white">Go</button>
        </form>
      </Sheet>

      <Sheet open={sheet === "chapters"} title="Chapters" onClose={() => setSheet(null)}>
        <ChaptersPanel
          chapters={chapters}
          covered={covered}
          currentPage={current.page}
          onJump={(p) => {
            goTo(p);
            setSheet(null);
          }}
          onToggle={onToggleChapter}
        />
      </Sheet>

      <Sheet
        open={sheet === "notes"}
        title="Notes & highlights"
        onClose={() => {
          setSheet(null);
          setDraft(null);
        }}
      >
        <NotesPanel
          notes={notes}
          currentPage={current.page}
          draft={draft}
          onStartNote={() => setDraft({ page: current.page })}
          onCancelDraft={() => setDraft(null)}
          onSaveDraft={saveDraft}
          onDelete={removeNote}
          onJump={(p) => {
            goTo(p);
            setSheet(null);
          }}
        />
      </Sheet>
    </div>
  );
}

const EMPTY: PageHighlight[] = [];

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="min-w-10 rounded-lg px-2 py-2 text-lg leading-none hover:bg-black/10">
      {children}
    </button>
  );
}
