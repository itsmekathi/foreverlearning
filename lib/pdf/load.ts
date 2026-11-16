"use client";
// Opens a book with pdf.js using byte-range requests only: nothing is downloaded until a page
// needs it. Fetched chunks are kept in IndexedDB (last few books) so re-reading and offline work.
import { createStore, del, delMany, get, keys, set, setMany } from "idb-keyval";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Pdfjs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<Pdfjs> | null = null;

export function getPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

export const CHUNK = 256 * 1024;
const KEEP_BOOKS = 3;

const chunkStore = () => createStore("foreverlearning-chunks", "chunks");
const metaStore = () => createStore("foreverlearning-meta", "meta");

export type BookRef = { id: number; sha: string; size: number };

const fileUrl = (b: BookRef) => `/api/books/${b.id}/file?v=${b.sha.slice(0, 12)}`;

async function rememberBook(sha: string) {
  const store = metaStore();
  const recent = ((await get<string[]>("recent", store)) ?? []).filter((s) => s !== sha);
  recent.unshift(sha);
  await set("recent", recent.slice(0, KEEP_BOOKS), store);
  const drop = new Set(recent.slice(KEEP_BOOKS));
  if (!drop.size) return;
  const cs = chunkStore();
  const all = (await keys(cs)) as string[];
  await delMany(all.filter((k) => drop.has(k.split(":")[0])), cs);
}

async function fetchRange(url: string, begin: number, end: number, attempt = 0): Promise<Response> {
  try {
    const res = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (e) {
    if (attempt >= 2) throw e;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    return fetchRange(url, begin, end, attempt + 1);
  }
}

export async function openBook(
  book: BookRef,
  opts: { worker?: unknown; onError?: (e: Error) => void } = {},
): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const url = fileUrl(book);
  const store = chunkStore();
  let fullFile: Uint8Array | null = null; // set if the server ignores Range and sends everything

  class RangeTransport extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin: number, end: number) {
      this.load(begin, end).catch((e) => opts.onError?.(e as Error));
    }

    private async load(begin: number, end: number) {
      if (fullFile) return this.onDataRange(begin, fullFile.subarray(begin, end));

      // Serve from the on-device cache if every chunk in the range is there.
      const chunkKeys: string[] = [];
      for (let b = begin; b < end; b += CHUNK) chunkKeys.push(`${book.sha}:${b}`);
      const cached = await Promise.all(chunkKeys.map((k) => get<Uint8Array>(k, store).catch(() => undefined)));
      if (cached.every(Boolean)) {
        const out = new Uint8Array(end - begin);
        cached.forEach((c, i) => out.set(c!, i * CHUNK));
        return this.onDataRange(begin, out);
      }

      const res = await fetchRange(url, begin, end);
      const data = new Uint8Array(await res.arrayBuffer());
      if (res.status === 200 && data.length === book.size && (begin > 0 || end < book.size)) {
        fullFile = data;
        return this.onDataRange(begin, data.subarray(begin, end));
      }
      this.onDataRange(begin, data);

      const entries: [string, Uint8Array][] = [];
      for (let off = 0; off < data.length; off += CHUNK) {
        entries.push([`${book.sha}:${begin + off}`, data.slice(off, off + CHUNK)]);
      }
      setMany(entries, store).catch(() => {}); // storage full / private mode: just skip caching
    }
  }

  rememberBook(book.sha).catch(() => {});
  const transport = new RangeTransport(book.size, null);
  return pdfjs.getDocument({
    range: transport,
    length: book.size,
    rangeChunkSize: CHUNK,
    disableAutoFetch: true, // only fetch what's rendered
    disableStream: true,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    worker: opts.worker as never,
  }).promise;
}

/* ---------- Table of contents → chapters ---------- */

export type ExtractedChapter = { title: string; depth: number; startPage: number; endPage: number };

export async function extractChapters(pdf: PDFDocumentProxy, maxDepth = 2): Promise<ExtractedChapter[]> {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline?.length) return [];

  type Item = { title: string; dest: unknown; items?: Item[] };
  const flat: { title: string; depth: number; startPage: number }[] = [];

  async function resolve(dest: unknown): Promise<number | null> {
    try {
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit[0] == null) return null;
      const ref = explicit[0];
      const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref);
      return index + 1;
    } catch {
      return null;
    }
  }

  async function walk(items: Item[], depth: number) {
    for (const it of items) {
      if (flat.length >= 500) return;
      const page = await resolve(it.dest);
      if (page) flat.push({ title: (it.title || "").trim(), depth, startPage: page });
      if (it.items?.length && depth < maxDepth) await walk(it.items, depth + 1);
    }
  }
  await walk(outline as Item[], 0);

  flat.sort((a, b) => a.startPage - b.startPage || a.depth - b.depth);
  return flat.map((c, i) => {
    const next = flat.slice(i + 1).find((n) => n.depth <= c.depth && n.startPage > c.startPage);
    return { ...c, endPage: Math.max(c.startPage, (next?.startPage ?? pdf.numPages + 1) - 1) };
  });
}

/* ---------- Covers (first page thumbnail, cached on device) ---------- */

let coverWorker: unknown = null;
let coverQueue: Promise<unknown> = Promise.resolve();

export async function getCover(book: BookRef, width = 240): Promise<string | null> {
  const key = `cover:${book.sha}`;
  const store = metaStore();
  const hit = await get<string>(key, store).catch(() => undefined);
  if (hit) return hit;

  // One cover at a time with a shared worker so the library page stays light.
  const job = coverQueue.then(async () => {
    const pdfjs = await getPdfjs();
    coverWorker ??= new pdfjs.PDFWorker();
    const pdf = await openBook(book, { worker: coverWorker });
    try {
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.75);
      set(key, url, store).catch(() => {});
      return url;
    } finally {
      pdf.destroy();
    }
  });
  coverQueue = job.catch(() => null);
  return job.catch(() => null);
}

export async function clearCover(sha: string) {
  await del(`cover:${sha}`, metaStore()).catch(() => {});
}
