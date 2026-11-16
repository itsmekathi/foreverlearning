// Saves the reading position. Called with fetch (debounced) and navigator.sendBeacon (on close).
// Last write wins by the client's timestamp, so an old queued offline save can't overwrite newer progress.
import { and, eq, sql } from "drizzle-orm";
import { getDb, books, progress } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUser();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const bookId = Number((await params).id);

  const body = (await req.json().catch(() => null)) as { page?: number; offset?: number; updatedAt?: string } | null;
  const page = Math.floor(Number(body?.page));
  const offset = Math.min(1, Math.max(0, Number(body?.offset) || 0));
  const updatedAt = body?.updatedAt ? new Date(body.updatedAt) : new Date();
  if (!Number.isFinite(page) || page < 1 || Number.isNaN(updatedAt.getTime())) {
    return new Response("Bad request", { status: 400 });
  }

  const db = getDb();
  const [book] = await db.select({ pageCount: books.pageCount }).from(books).where(eq(books.id, bookId));
  if (!book) return new Response("Not found", { status: 404 });
  const finished = book.pageCount != null && page >= book.pageCount;

  const saved = await db
    .insert(progress)
    .values({ userId, bookId, page, offset, updatedAt, finishedAt: finished ? new Date() : null })
    .onConflictDoUpdate({
      target: [progress.userId, progress.bookId],
      set: {
        page,
        offset,
        updatedAt,
        finishedAt: finished ? sql`coalesce(${progress.finishedAt}, now())` : progress.finishedAt,
      },
      setWhere: sql`${progress.updatedAt} < ${updatedAt.toISOString()}`,
    })
    .returning({ page: progress.page });

  if (saved.length) {
    // Tick chapters you've read past (all of them once the book is finished).
    await db.execute(sql`
      insert into chapter_covered (user_id, chapter_id, manual)
      select ${userId}, c.id, false from chapters c
      where c.book_id = ${bookId} and (c.end_page < ${page} or ${finished})
      on conflict do nothing`);
  }

  // Report the stored position so a client with stale data can catch up.
  const [current] = await db
    .select({ page: progress.page, offset: progress.offset, updatedAt: progress.updatedAt })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.bookId, bookId)));
  return Response.json({ applied: saved.length > 0, current });
}
