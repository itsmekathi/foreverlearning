import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, userToday } from "@/lib/session";
import { getBookDetail } from "@/lib/queries";
import { getDb, books } from "@/lib/db";
import { eq } from "drizzle-orm";
import { totalsByBook, formatMinutes } from "@/lib/stats";
import { Cover } from "@/components/Cover";
import { PlanLine } from "@/components/PlanLine";
import { PlanForm } from "@/components/book/PlanForm";
import { ChapterChecklist } from "@/components/book/ChapterChecklist";
import { BookActions } from "@/components/book/BookActions";
import { NoteList } from "@/components/book/NoteList";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [b] = await getDb().select({ title: books.title }).from(books).where(eq(books.id, Number((await params).id)));
  return { title: b?.title ?? "Book" };
}

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const id = Number((await params).id);
  const today = await userToday();
  const d = await getBookDetail(userId, id, today);
  if (!d) notFound();
  const { book, progress, plan, planStatus, chapters } = d;

  const page = progress?.page ?? 1;
  const finished = !!progress?.finishedAt;
  const total = book.pageCount;
  const pct = total ? Math.round(((finished ? total : page - 1) / total) * 100) : 0;
  const coveredCount = chapters.filter((c) => c.covered).length;
  const stats = totalsByBook(d.sessions)[0];

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-fg">
        ← Library
      </Link>

      <section className="flex gap-4 sm:gap-6">
        <div className="w-28 shrink-0 sm:w-40">
          <Cover book={book} title={book.title} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{book.title}</h1>
          {book.author && <p className="mt-1 text-sm text-muted">{book.author}</p>}
          <p className="mt-1 text-xs text-muted">{book.path}</p>
          {book.missing && <p className="mt-2 text-sm text-red-600">This file is no longer in the repository.</p>}

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-hover">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {finished ? "Finished" : progress ? `Page ${page}${total ? ` of ${total}` : ""} · ${pct}%` : "Not started"}
            {chapters.length > 0 && ` · ${coveredCount}/${chapters.length} chapters`}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/read/${book.id}`} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90">
              {progress && !finished ? `Continue · p.${page}` : finished ? "Read again" : "Start reading"}
            </Link>
            <BookActions bookId={book.id} finished={finished} started={!!progress} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Reading plan</h2>
          {planStatus && (
            <div className="mb-4 rounded-xl bg-hover p-3 text-sm">
              <PlanLine s={planStatus} />
            </div>
          )}
          {total ? (
            <PlanForm
              bookId={book.id}
              today={today}
              totalPages={total}
              currentPage={page}
              plan={
                plan && {
                  mode: plan.mode,
                  targetDate: plan.targetDate,
                  pagesPerDay: plan.pagesPerDay,
                  readingDays: plan.readingDays,
                }
              }
            />
          ) : (
            <p className="text-sm text-muted">Open the book once so we know how many pages it has.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">
            Chapters{" "}
            {chapters.length > 0 && (
              <span className="text-sm font-normal text-muted">
                {coveredCount}/{chapters.length} covered
              </span>
            )}
          </h2>
          <ChapterChecklist bookId={book.id} chapters={chapters} currentPage={page} outlineSeeded={book.outlineSeeded} />
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">
            Notes & highlights <span className="text-sm font-normal text-muted">{d.notes.length}</span>
          </h2>
          <NoteList bookId={book.id} notes={d.notes} />
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Your time with this book</h2>
          {stats ? (
            <dl className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Time read" value={formatMinutes(stats.minutes)} />
              <Stat label="Sessions" value={String(stats.sessions)} />
              <Stat label="Pages read" value={String(stats.pages)} />
            </dl>
          ) : (
            <p className="text-sm text-muted">Reading time shows up here after your first session.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-hover p-3">
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
