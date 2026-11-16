// Streaks and reading aggregates from reading sessions. Pure functions.
import { addDays, diffDays } from "./dates";

export type SessionLike = {
  bookId: number;
  localDate: string;
  startedAt: Date;
  endedAt: Date;
  pagesRead: number;
};

const MIN_SESSION_MS = 60_000;

const minutes = (s: SessionLike) => Math.max(0, s.endedAt.getTime() - s.startedAt.getTime()) / 60_000;

/** A session "counts" if you read at least one page or spent at least a minute. */
export const counts = (s: SessionLike) =>
  s.pagesRead > 0 || s.endedAt.getTime() - s.startedAt.getTime() >= MIN_SESSION_MS;

export function activeDays(sessions: SessionLike[]): Set<string> {
  return new Set(sessions.filter(counts).map((s) => s.localDate));
}

/**
 * Current streak: consecutive days with reading ending today — or yesterday, so the streak
 * isn't shown as broken before you've had a chance to read today.
 */
export function streaks(sessions: SessionLike[], today: string) {
  const days = activeDays(sessions);
  let current = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    current++;
    d = addDays(d, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && diffDays(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest, readToday: days.has(today) };
}

export type DayTotal = { date: string; pages: number; minutes: number };

/** Totals for each of the last `n` days, oldest first (days without reading included as 0). */
export function dailyTotals(sessions: SessionLike[], today: string, n: number): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    map.set(date, { date, pages: 0, minutes: 0 });
  }
  for (const s of sessions) {
    const t = map.get(s.localDate);
    if (!t || !counts(s)) continue;
    t.pages += s.pagesRead;
    t.minutes += minutes(s);
  }
  return [...map.values()].map((t) => ({ ...t, minutes: Math.round(t.minutes) }));
}

export function totalsByBook(sessions: SessionLike[]) {
  const map = new Map<number, { bookId: number; pages: number; minutes: number; sessions: number; lastRead: string }>();
  for (const s of sessions) {
    if (!counts(s)) continue;
    const t = map.get(s.bookId) ?? { bookId: s.bookId, pages: 0, minutes: 0, sessions: 0, lastRead: s.localDate };
    t.pages += s.pagesRead;
    t.minutes += minutes(s);
    t.sessions++;
    if (s.localDate > t.lastRead) t.lastRead = s.localDate;
    map.set(s.bookId, t);
  }
  return [...map.values()]
    .map((t) => ({ ...t, minutes: Math.round(t.minutes) }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}
