"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  getDb,
  books,
  chapters,
  chapterCovered,
  notes,
  plans,
  progress,
  type HighlightRect,
} from "@/lib/db";
import { requireUser, userToday } from "@/lib/session";
import { listRepoPdfs, titleFromPath } from "@/lib/github";
import { ALL_DAYS } from "@/lib/plan";

/* ---------- Library sync with the Git repo ---------- */

export async function syncLibrary(): Promise<{ added: number; updated: number; removed: number; error?: string }> {
  await requireUser();
  const db = getDb();
  let pdfs;
  try {
    pdfs = await listRepoPdfs();
  } catch (e) {
    return { added: 0, updated: 0, removed: 0, error: (e as Error).message };
  }

  const existing = await db.select().from(books);
  const byPath = new Map(existing.map((b) => [b.path, b]));
  let added = 0;
  let updated = 0;

  for (const f of pdfs) {
    const old = byPath.get(f.path);
    if (!old) {
      await db.insert(books).values({ path: f.path, title: titleFromPath(f.path), sha: f.sha, size: f.size, lfs: f.lfs });
      added++;
    } else if (old.sha !== f.sha || old.missing) {
      const changed = old.sha !== f.sha;
      await db
        .update(books)
        .set({
          sha: f.sha,
          size: f.size,
          lfs: f.lfs,
          missing: false,
          updatedAt: new Date(),
          // New file contents → re-read page count and outline on next open.
          ...(changed ? { pageCount: null, outlineSeeded: false } : {}),
        })
        .where(eq(books.id, old.id));
      if (changed) await db.delete(chapters).where(and(eq(chapters.bookId, old.id), eq(chapters.manual, false)));
      updated++;
    }
  }

  const paths = pdfs.map((p) => p.path);
  const gone = await db
    .update(books)
    .set({ missing: true })
    .where(and(eq(books.missing, false), paths.length ? notInArray(books.path, paths) : sql`true`))
    .returning({ id: books.id });

  revalidatePath("/");
  return { added, updated, removed: gone.length };
}

/* ---------- Metadata the reader extracts from the PDF itself ---------- */

export type OutlineChapter = { title: string; depth: number; startPage: number; endPage: number };

export async function saveBookMeta(
  bookId: number,
  meta: { pageCount: number; author?: string | null; chapters?: OutlineChapter[] },
) {
  await requireUser();
  const db = getDb();
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  if (!book) return;

  const set: Partial<typeof books.$inferInsert> = { pageCount: meta.pageCount };
  if (meta.author && !book.author) set.author = meta.author.slice(0, 200);

  if (!book.outlineSeeded && meta.chapters) {
    const rows = meta.chapters.slice(0, 500).map((c, i) => ({
      bookId,
      idx: i,
      title: c.title.slice(0, 300) || `Section ${i + 1}`,
      depth: Math.min(5, Math.max(0, c.depth)),
      startPage: Math.max(1, Math.min(meta.pageCount, c.startPage)),
      endPage: Math.max(1, Math.min(meta.pageCount, c.endPage)),
    }));
    if (rows.length) await db.insert(chapters).values(rows);
    set.outlineSeeded = true;
  }
  await db.update(books).set(set).where(eq(books.id, bookId));
}

/* ---------- Reading plan ---------- */

export async function savePlan(bookId: number, formData: FormData) {
  const userId = await requireUser();
  const db = getDb();
  const mode = formData.get("mode") === "pace" ? "pace" : "date";
  const days = formData.getAll("days").map(Number).filter((d) => d >= 0 && d <= 6);
  const readingDays = days.length ? days.reduce((m, d) => m | (1 << d), 0) : ALL_DAYS;
  const targetDate = String(formData.get("targetDate") || "") || null;
  const pagesPerDay = Math.max(1, Number(formData.get("pagesPerDay")) || 10);

  const [p] = await db
    .select({ page: progress.page })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.bookId, bookId)));

  const values = {
    userId,
    bookId,
    mode: mode as "date" | "pace",
    startDate: await userToday(),
    startPage: p?.page ?? 1,
    targetDate: mode === "date" ? targetDate : null,
    pagesPerDay: mode === "pace" ? pagesPerDay : null,
    readingDays,
  };
  if (mode === "date" && !targetDate) return;

  await db
    .insert(plans)
    .values(values)
    .onConflictDoUpdate({ target: [plans.userId, plans.bookId], set: values });
  revalidatePath(`/book/${bookId}`);
  revalidatePath("/");
}

export async function deletePlan(bookId: number) {
  const userId = await requireUser();
  await getDb().delete(plans).where(and(eq(plans.userId, userId), eq(plans.bookId, bookId)));
  revalidatePath(`/book/${bookId}`);
  revalidatePath("/");
}

/* ---------- Chapter checklist ---------- */

export async function toggleChapter(bookId: number, chapterId: number, covered: boolean) {
  const userId = await requireUser();
  const db = getDb();
  if (covered) {
    await db
      .insert(chapterCovered)
      .values({ userId, chapterId, manual: true })
      .onConflictDoNothing();
  } else {
    await db
      .delete(chapterCovered)
      .where(and(eq(chapterCovered.userId, userId), eq(chapterCovered.chapterId, chapterId)));
  }
  revalidatePath(`/book/${bookId}`);
}

export async function addChapter(bookId: number, formData: FormData) {
  await requireUser();
  const db = getDb();
  const title = String(formData.get("title") || "").trim();
  const startPage = Math.max(1, Number(formData.get("startPage")) || 1);
  if (!title) return;
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  const last = book?.pageCount ?? startPage;

  type Item = { id?: number; startPage: number; depth: number };
  const existing: Item[] = await db
    .select({ id: chapters.id, startPage: chapters.startPage, depth: chapters.depth })
    .from(chapters)
    .where(eq(chapters.bookId, bookId));
  const list: Item[] = [...existing, { startPage, depth: 0 }].sort((a, b) => a.startPage - b.startPage);

  // Recompute order and end pages for top-level chapters so the new one slots in.
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const next = list.slice(i + 1).find((n) => n.depth <= c.depth);
    const endPage = Math.max(c.startPage, (next?.startPage ?? last + 1) - 1);
    if (c.id) await db.update(chapters).set({ idx: i, endPage }).where(eq(chapters.id, c.id));
    else await db.insert(chapters).values({ bookId, idx: i, title, depth: 0, startPage, endPage, manual: true });
  }
  revalidatePath(`/book/${bookId}`);
}

export async function deleteChapter(bookId: number, chapterId: number) {
  await requireUser();
  await getDb().delete(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.bookId, bookId)));
  revalidatePath(`/book/${bookId}`);
}

/* ---------- Notes, bookmarks, highlights ---------- */

export async function addNote(
  bookId: number,
  note: { page: number; kind: "bookmark" | "note" | "highlight"; text?: string; quote?: string; rects?: HighlightRect[]; color?: string },
) {
  const userId = await requireUser();
  const [row] = await getDb()
    .insert(notes)
    .values({
      userId,
      bookId,
      page: Math.max(1, Math.floor(note.page)),
      kind: note.kind,
      text: note.text?.slice(0, 10_000) || null,
      quote: note.quote?.slice(0, 5_000) || null,
      rects: note.rects?.slice(0, 200) ?? null,
      color: note.color ?? null,
    })
    .returning();
  revalidatePath(`/book/${bookId}`);
  return row;
}

export async function deleteNote(bookId: number, noteId: number) {
  const userId = await requireUser();
  await getDb().delete(notes).where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
  revalidatePath(`/book/${bookId}`);
}

export async function deleteNotes(bookId: number, ids: number[]) {
  const userId = await requireUser();
  if (!ids.length) return;
  await getDb().delete(notes).where(and(inArray(notes.id, ids), eq(notes.userId, userId)));
  revalidatePath(`/book/${bookId}`);
}

/* ---------- Progress controls on the overview page ---------- */

export async function setFinished(bookId: number, finished: boolean) {
  const userId = await requireUser();
  const db = getDb();
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  const page = finished ? book?.pageCount ?? 1 : 1;
  await db
    .insert(progress)
    .values({ userId, bookId, page, offset: 0, finishedAt: finished ? new Date() : null })
    .onConflictDoUpdate({
      target: [progress.userId, progress.bookId],
      set: { page, offset: 0, updatedAt: new Date(), finishedAt: finished ? new Date() : null },
    });
  if (!finished) {
    await db.execute(sql`delete from chapter_covered where user_id = ${userId}
      and chapter_id in (select id from chapters where book_id = ${bookId})`);
  }
  revalidatePath(`/book/${bookId}`);
  revalidatePath("/");
}
