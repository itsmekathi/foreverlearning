import Link from "next/link";
import { requireUser, userToday } from "@/lib/session";
import { getLibrary } from "@/lib/queries";
import { Cover } from "@/components/Cover";
import { SyncButton } from "@/components/SyncButton";
import { PlanLine } from "@/components/PlanLine";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const userId = await requireUser();
  const books = await getLibrary(userId, await userToday());
  const reading = books.filter((b) => b.lastReadAt && !b.finished);
  const continueBook = reading[0];

  if (books.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">Your library is empty</h1>
        <p className="mt-2 text-sm text-muted">
          Push PDFs to <code className="rounded bg-hover px-1">{process.env.GITHUB_REPO ?? "your repo"}</code>
          {process.env.GITHUB_BOOKS_PATH ? ` under /${process.env.GITHUB_BOOKS_PATH}` : ""}, then sync.
        </p>
        <div className="mt-6 flex justify-center">
          <SyncButton primary />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {continueBook && (
        <Link
          href={`/read/${continueBook.id}`}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:border-accent"
        >
          <div className="w-16 shrink-0">
            <Cover book={continueBook} title={continueBook.title} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-accent">Continue reading</div>
            <div className="truncate font-semibold">{continueBook.title}</div>
            <div className="text-sm text-muted">
              Page {continueBook.page}
              {continueBook.pageCount ? ` of ${continueBook.pageCount}` : ""}
            </div>
            {continueBook.plan && (
              <div className="mt-1 text-sm">
                <PlanLine s={continueBook.plan} compact />
              </div>
            )}
          </div>
          <span className="text-2xl text-muted">›</span>
        </Link>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">
            Library <span className="text-sm font-normal text-muted">{books.length}</span>
          </h1>
          <SyncButton />
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {books.map((b) => {
            const pct = b.pageCount ? Math.round(((b.finished ? b.pageCount : b.page - 1) / b.pageCount) * 100) : 0;
            return (
              <li key={b.id}>
                <Link href={`/book/${b.id}`} className="group block">
                  <Cover book={b} title={b.title} />
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm font-medium leading-snug group-hover:text-accent">{b.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {b.finished ? "Finished" : b.lastReadAt ? `${pct}% · p.${b.page}` : "Not started"}
                  </div>
                  {b.plan && !b.finished && (
                    <div className="mt-0.5 text-xs">
                      <PlanLine s={b.plan} compact />
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
