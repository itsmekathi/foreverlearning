import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, books, chapterCovered, chapters, notes, plans, progress, readingSessions } from "./db";
import { computePlan, type PlanStatus } from "./plan";

export type LibraryItem = {
  id: number;
  title: string;
  author: string | null;
  sha: string;
  size: number;
  pageCount: number | null;
  page: number;
  lastReadAt: string | null;
  finished: boolean;
  plan: PlanStatus | null;
};

/** The page each book was on when today started (from today's first session), for stable daily goals. */
async function dayStartPages(userId: string, today: string, bookIds?: number[]) {
  const rows = await getDb()
    .select({ bookId: readingSessions.bookId, page: sql<number>`min(${readingSessions.startPage})` })
    .from(readingSessions)
    .where(
      and(
        eq(readingSessions.userId, userId),
        eq(readingSessions.localDate, today),
        bookIds ? inArray(readingSessions.bookId, bookIds) : undefined,
      ),
    )
    .groupBy(readingSessions.bookId);
  return new Map(rows.map((r) => [r.bookId, Number(r.page)]));
}

export async function getLibrary(userId: string, today: string): Promise<LibraryItem[]> {
  const db = getDb();
  const rows = await db
    .select({ book: books, progress, plan: plans })
    .from(books)
    .leftJoin(progress, and(eq(progress.bookId, books.id), eq(progress.userId, userId)))
    .leftJoin(plans, and(eq(plans.bookId, books.id), eq(plans.userId, userId)))
    .where(eq(books.missing, false))
    .orderBy(asc(books.title));
  const starts = await dayStartPages(userId, today);

  return rows
    .map(({ book, progress: p, plan }) => {
      const page = p?.page ?? 1;
      const finished = !!p?.finishedAt;
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        sha: book.sha,
        size: book.size,
        pageCount: book.pageCount,
        page,
        lastReadAt: p?.updatedAt?.toISOString() ?? null,
        finished,
        plan:
          plan && book.pageCount
            ? computePlan(plan, book.pageCount, finished ? book.pageCount : page, Math.min(starts.get(book.id) ?? page, page), today)
            : null,
      };
    })
    .sort((a, b) => (b.lastReadAt ?? "").localeCompare(a.lastReadAt ?? ""));
}

export async function getBookDetail(userId: string, bookId: number, today: string) {
  const db = getDb();
  const [row] = await db
    .select({ book: books, progress, plan: plans })
    .from(books)
    .leftJoin(progress, and(eq(progress.bookId, books.id), eq(progress.userId, userId)))
    .leftJoin(plans, and(eq(plans.bookId, books.id), eq(plans.userId, userId)))
    .where(eq(books.id, bookId));
  if (!row) return null;

  const [chs, covered, ns, sessions, starts] = await Promise.all([
    db.select().from(chapters).where(eq(chapters.bookId, bookId)).orderBy(asc(chapters.idx)),
    db
      .select({ id: chapterCovered.chapterId })
      .from(chapterCovered)
      .innerJoin(chapters, eq(chapters.id, chapterCovered.chapterId))
      .where(and(eq(chapterCovered.userId, userId), eq(chapters.bookId, bookId))),
    db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.bookId, bookId)))
      .orderBy(asc(notes.page), asc(notes.createdAt)),
    db
      .select()
      .from(readingSessions)
      .where(and(eq(readingSessions.userId, userId), eq(readingSessions.bookId, bookId))),
    dayStartPages(userId, today, [bookId]),
  ]);

  const coveredSet = new Set(covered.map((c) => c.id));
  const page = row.progress?.page ?? 1;
  const finished = !!row.progress?.finishedAt;
  const total = row.book.pageCount;

  return {
    book: row.book,
    progress: row.progress,
    plan: row.plan,
    planStatus:
      row.plan && total
        ? computePlan(row.plan, total, finished ? total : page, Math.min(starts.get(bookId) ?? page, page), today)
        : null,
    chapters: chs.map((c) => ({
      id: c.id,
      title: c.title,
      depth: c.depth,
      startPage: c.startPage,
      endPage: c.endPage,
      manual: c.manual,
      covered: coveredSet.has(c.id),
    })),
    notes: ns.map((n) => ({
      id: n.id,
      page: n.page,
      kind: n.kind,
      text: n.text,
      quote: n.quote,
      rects: n.rects ?? null,
      color: n.color,
      createdAt: n.createdAt.toISOString(),
    })),
    sessions,
  };
}
