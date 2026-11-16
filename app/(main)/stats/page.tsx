import Link from "next/link";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, books, readingSessions } from "@/lib/db";
import { requireUser, userToday } from "@/lib/session";
import { addDays, formatDay, weekday } from "@/lib/dates";
import { dailyTotals, formatMinutes, streaks, totalsByBook } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress" };

const HEAT_WEEKS = 18;

export default async function StatsPage() {
  const userId = await requireUser();
  const today = await userToday();
  const db = getDb();
  const since = addDays(today, -400);
  const sessions = await db
    .select()
    .from(readingSessions)
    .where(and(eq(readingSessions.userId, userId), gte(readingSessions.localDate, since)));

  const st = streaks(sessions, today);
  const last14 = dailyTotals(sessions, today, 14);
  const week = last14.slice(-7);
  const weekPages = week.reduce((a, d) => a + d.pages, 0);
  const weekMinutes = week.reduce((a, d) => a + d.minutes, 0);

  // Heatmap: columns are weeks (Sun→Sat), ending with the current week.
  const heatStart = addDays(today, -(HEAT_WEEKS - 1) * 7 - weekday(today));
  const heat = dailyTotals(sessions, today, (HEAT_WEEKS - 1) * 7 + weekday(today) + 1);
  const heatMax = Math.max(1, ...heat.map((d) => d.pages));
  const level = (p: number) => (p <= 0 ? 0 : Math.min(4, Math.ceil((p / heatMax) * 4)));

  const byBook = totalsByBook(sessions);
  const titles = byBook.length
    ? new Map(
        (
          await db
            .select({ id: books.id, title: books.title })
            .from(books)
            .where(inArray(books.id, byBook.map((b) => b.bookId)))
        ).map((b) => [b.id, b.title]),
      )
    : new Map<number, string>();

  const barMax = Math.max(1, ...last14.map((d) => d.pages));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Your progress</h1>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Current streak" value={`${st.current} day${st.current === 1 ? "" : "s"}`} hint={st.readToday ? "Read today ✓" : st.current ? "Read today to keep it" : "Start one today"} />
        <Tile label="Longest streak" value={`${st.longest} day${st.longest === 1 ? "" : "s"}`} />
        <Tile label="Pages this week" value={String(weekPages)} />
        <Tile label="Time this week" value={formatMinutes(weekMinutes)} />
      </dl>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="mb-1 font-semibold">Reading days</h2>
        <p className="mb-4 text-xs text-muted">Last {HEAT_WEEKS} weeks · darker = more pages</p>
        <div className="overflow-x-auto">
          <div
            className="grid w-max grid-flow-col gap-[3px]"
            style={{ gridTemplateRows: "repeat(7, 14px)", gridAutoColumns: "14px" }}
            role="img"
            aria-label={`Reading heatmap: ${heat.filter((d) => d.pages > 0).length} reading days in the last ${HEAT_WEEKS} weeks`}
          >
            {heat.map((d) => (
              <div
                key={d.date}
                title={`${formatDay(d.date)}: ${d.pages} pages, ${formatMinutes(d.minutes)}`}
                className="rounded-[3px]"
                style={{ background: HEAT[level(d.pages)], outline: d.date === today ? "1.5px solid var(--fg)" : undefined }}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 text-xs text-muted">
          Less
          {HEAT.map((c) => (
            <span key={c} className="inline-block h-3 w-3 rounded-[3px]" style={{ background: c }} />
          ))}
          More
          <span className="ml-auto">since {formatDay(heatStart)}</span>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="mb-4 font-semibold">Pages per day · last 14 days</h2>
        <div className="flex h-40 items-end gap-[2px] border-b border-line" role="img" aria-label="Pages read per day for the last 14 days">
          {last14.map((d) => (
            <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${formatDay(d.date)}: ${d.pages} pages · ${formatMinutes(d.minutes)}`}>
              <div
                className="w-full rounded-t-[4px] bg-accent"
                style={{ height: d.pages ? `${Math.max(3, (d.pages / barMax) * 100)}%` : 0 }}
              />
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-fg px-1.5 py-0.5 text-[10px] text-bg group-hover:block">
                {d.pages}p
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{formatDay(last14[0].date)}</span>
          <span>Today</span>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted">Show as table</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-muted">
              <tr><th className="py-1 font-normal">Day</th><th className="font-normal">Pages</th><th className="font-normal">Time</th></tr>
            </thead>
            <tbody>
              {[...last14].reverse().map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1">{formatDay(d.date)}</td>
                  <td className="tabular-nums">{d.pages}</td>
                  <td className="tabular-nums">{formatMinutes(d.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="mb-3 font-semibold">Time by book</h2>
        {byBook.length === 0 ? (
          <p className="text-sm text-muted">No reading sessions yet. Open a book to start tracking.</p>
        ) : (
          <ul className="divide-y divide-line">
            {byBook.map((b) => (
              <li key={b.bookId}>
                <Link href={`/book/${b.bookId}`} className="flex items-baseline gap-3 py-2.5 hover:text-accent">
                  <span className="min-w-0 flex-1 truncate text-sm">{titles.get(b.bookId) ?? "Removed book"}</span>
                  <span className="text-xs tabular-nums text-muted">{b.pages}p</span>
                  <span className="w-16 text-right text-sm tabular-nums">{formatMinutes(b.minutes)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// One hue (the accent), light → dark, mixed with the surface so it works in both themes.
const HEAT = [
  "var(--hover)",
  "color-mix(in oklab, var(--accent) 30%, var(--surface))",
  "color-mix(in oklab, var(--accent) 55%, var(--surface))",
  "color-mix(in oklab, var(--accent) 80%, var(--surface))",
  "var(--accent)",
];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
      {hint && <p className="mt-1 text-xs text-accent">{hint}</p>}
    </div>
  );
}
