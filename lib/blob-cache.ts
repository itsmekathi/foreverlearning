// Temporary copies of repo PDFs in Vercel Blob. Pages are served from the cached copy
// once it exists; the daily cron removes copies that haven't been read for a while.
import "server-only";
import { put, del } from "@vercel/blob";
import { and, eq, lt, or } from "drizzle-orm";
import { getDb, blobCache, type Book } from "./db";
import { fetchFromGitHub } from "./github";

const PENDING_TIMEOUT_MS = 15 * 60_000;
const TOUCH_INTERVAL_MS = 60 * 60_000;

export const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function getReadyCache(sha: string) {
  const [row] = await getDb().select().from(blobCache).where(eq(blobCache.sha, sha));
  return row?.status === "ready" && row.url ? row : null;
}

/** Update last_accessed, at most once an hour, so the cron knows the book is in use. */
export async function touchCache(row: { sha: string; lastAccessed: Date }) {
  if (Date.now() - row.lastAccessed.getTime() < TOUCH_INTERVAL_MS) return;
  await getDb()
    .update(blobCache)
    .set({ lastAccessed: new Date() })
    .where(eq(blobCache.sha, row.sha));
}

export async function dropCache(sha: string, url?: string | null) {
  if (url) await del(url).catch(() => {});
  await getDb().delete(blobCache).where(eq(blobCache.sha, sha));
}

/** Copy the whole PDF from GitHub into Blob. Safe to call many times at once: one wins the lock. */
export async function warmCache(book: Pick<Book, "sha" | "path" | "lfs" | "size">) {
  if (!blobEnabled()) return;
  const db = getDb();

  // Take the lock (insert pending row) unless someone holds a fresh one.
  const staleBefore = new Date(Date.now() - PENDING_TIMEOUT_MS);
  await db
    .delete(blobCache)
    .where(and(eq(blobCache.sha, book.sha), eq(blobCache.status, "pending"), lt(blobCache.createdAt, staleBefore)));
  const locked = await db
    .insert(blobCache)
    .values({ sha: book.sha, status: "pending" })
    .onConflictDoNothing()
    .returning({ sha: blobCache.sha });
  if (locked.length === 0) return;

  try {
    const res = await fetchFromGitHub(book.path, book.lfs);
    if (!res.ok || !res.body) throw new Error(`GitHub responded ${res.status}`);
    const blob = await put(`cache/${book.sha}.pdf`, res.body, {
      access: "public", // URL is random and never sent to the browser; the app proxies it
      addRandomSuffix: true,
      contentType: "application/pdf",
      multipart: book.size > 8 * 1024 * 1024,
    });
    await db
      .update(blobCache)
      .set({ status: "ready", url: blob.url, size: book.size, lastAccessed: new Date() })
      .where(eq(blobCache.sha, book.sha));
  } catch (err) {
    console.error("warmCache failed", book.path, err);
    await db.delete(blobCache).where(eq(blobCache.sha, book.sha));
  }
}

/** Delete cached copies not read in `ttlDays` (and stuck pending rows). */
export async function cleanupCache(ttlDays: number) {
  const db = getDb();
  const cutoff = new Date(Date.now() - ttlDays * 86_400_000);
  const stuck = new Date(Date.now() - PENDING_TIMEOUT_MS);
  const rows = await db
    .select()
    .from(blobCache)
    .where(
      or(
        lt(blobCache.lastAccessed, cutoff),
        and(eq(blobCache.status, "pending"), lt(blobCache.createdAt, stuck)),
      ),
    );
  const urls = rows.map((r) => r.url).filter((u): u is string => !!u);
  if (urls.length) await del(urls);
  for (const r of rows) await db.delete(blobCache).where(eq(blobCache.sha, r.sha));
  return { deleted: rows.length };
}
