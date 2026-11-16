"use client";
// Client-side progress + session saving with an offline queue in IndexedDB.
import { createStore, del, entries, get, set } from "idb-keyval";

const queue = () => createStore("foreverlearning-queue", "pending");

export type ProgressPayload = { page: number; offset: number; updatedAt: string };
export type SessionPayload = {
  id: string;
  localDate: string;
  startedAt: string;
  endedAt: string;
  startPage: number;
  endPage: number;
  pagesRead: number;
};

async function post(url: string, body: unknown, keepalive = false) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
  if (!res.ok && res.status !== 400 && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  return res;
}

/** Try to send now; if offline or failing, keep the latest payload per key and retry later. */
async function sendOrQueue(key: string, url: string, body: unknown, keepalive = false) {
  try {
    await post(url, body, keepalive);
    await del(key, queue()).catch(() => {});
  } catch {
    await set(key, { url, body }, queue()).catch(() => {});
  }
}

export function saveProgress(bookId: number, p: ProgressPayload, keepalive = false) {
  return sendOrQueue(`progress:${bookId}`, `/api/books/${bookId}/progress`, p, keepalive);
}

export function saveSession(bookId: number, s: SessionPayload, keepalive = false) {
  return sendOrQueue(`session:${s.id}`, `/api/books/${bookId}/session`, s, keepalive);
}

/** For page close: sendBeacon survives the page unloading; also queue in case it fails. */
export function beacon(bookId: number, p: ProgressPayload, s?: SessionPayload) {
  const send = (url: string, body: unknown) =>
    navigator.sendBeacon?.(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
  const ok = send(`/api/books/${bookId}/progress`, p);
  if (!ok) set(`progress:${bookId}`, { url: `/api/books/${bookId}/progress`, body: p }, queue()).catch(() => {});
  if (s) {
    const ok2 = send(`/api/books/${bookId}/session`, s);
    if (!ok2) set(`session:${s.id}`, { url: `/api/books/${bookId}/session`, body: s }, queue()).catch(() => {});
  }
}

/** Locally queued progress for a book (newer than the server's if we were offline). */
export async function pendingProgress(bookId: number): Promise<ProgressPayload | null> {
  const item = await get<{ body: ProgressPayload }>(`progress:${bookId}`, queue()).catch(() => undefined);
  return item?.body ?? null;
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const items = await entries<string, { url: string; body: unknown }>(queue());
    for (const [key, { url, body }] of items) {
      try {
        await post(url, body);
        await del(key, queue());
      } catch {
        break; // still offline; try again later
      }
    }
  } finally {
    flushing = false;
  }
}

export function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
