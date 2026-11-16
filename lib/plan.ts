// Reading-schedule math. Pure functions on "YYYY-MM-DD" strings so they are easy to test.
import { addDays, diffDays, weekday } from "./dates";

export const ALL_DAYS = 0b1111111;
export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type PlanInput = {
  mode: "date" | "pace";
  startDate: string;
  startPage: number;
  targetDate: string | null;
  pagesPerDay: number | null;
  readingDays: number; // bitmask, bit 0 = Sunday
};

export type PlanStatus = {
  today: string;
  isReadingDay: boolean;
  /** Pages to read today (0 on rest days or when finished). */
  todayGoal: number;
  /** Today's target range, inclusive. */
  targetFrom: number;
  targetTo: number;
  /** Pages already read today. */
  readToday: number;
  todayDone: boolean;
  /** Positive = ahead of the original schedule, negative = behind (pages). */
  delta: number;
  projectedFinish: string | null;
  finished: boolean;
  overdue: boolean;
};

export const isReadingDay = (mask: number, d: string) => ((mask || ALL_DAYS) >> weekday(d)) & 1;

/** Number of reading days in [from, to], inclusive. */
export function countReadingDays(mask: number, from: string, to: string): number {
  const n = diffDays(from, to) + 1;
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) if (isReadingDay(mask, addDays(from, i))) count++;
  return count;
}

/** Date of the n-th reading day starting at `from` (n = 1 → first reading day on/after from). */
export function nthReadingDay(mask: number, from: string, n: number): string {
  let d = from;
  let seen = 0;
  for (let guard = 0; guard < 365 * 20; guard++) {
    if (isReadingDay(mask, d) && ++seen >= n) return d;
    d = addDays(d, 1);
  }
  return d;
}

/**
 * @param currentPage   the page the reader is on now (pages before it count as read)
 * @param dayStartPage  the page they were on when today started (so the goal doesn't move while reading)
 */
export function computePlan(
  plan: PlanInput,
  totalPages: number,
  currentPage: number,
  dayStartPage: number,
  today: string,
): PlanStatus {
  const mask = plan.readingDays || ALL_DAYS;
  const readingToday = !!isReadingDay(mask, today);
  const finished = currentPage >= totalPages;
  const remainingAtDayStart = Math.max(0, totalPages - dayStartPage + 1);
  const readToday = Math.max(0, currentPage - dayStartPage);

  // Original pace: what the plan asked for when it was created.
  const planPages = Math.max(1, totalPages - plan.startPage + 1);
  let perDay: number; // pace from today on
  let basePace: number; // pace the plan originally asked for
  let overdue = false;
  if (plan.mode === "date" && plan.targetDate) {
    const totalDays = Math.max(1, countReadingDays(mask, plan.startDate, plan.targetDate));
    basePace = Math.ceil(planPages / totalDays);
    // Re-spread what's left over the reading days that remain (today included if it is one),
    // so a missed day becomes a slightly bigger goal rather than a growing backlog.
    const daysLeft = countReadingDays(mask, today, plan.targetDate);
    if (daysLeft <= 0) {
      overdue = !finished;
      perDay = remainingAtDayStart;
    } else {
      perDay = Math.ceil(remainingAtDayStart / daysLeft);
    }
  } else {
    perDay = Math.max(1, plan.pagesPerDay ?? 10);
    basePace = perDay;
  }

  // Ahead/behind vs the original schedule, judged at the start of today; reading today
  // only counts as "ahead" once you go past today's share.
  const daysElapsed =
    diffDays(plan.startDate, today) > 0 ? countReadingDays(mask, plan.startDate, addDays(today, -1)) : 0;
  const expectedAtDayStart = Math.min(planPages, daysElapsed * basePace);
  const readAtDayStart = Math.max(0, dayStartPage - plan.startPage);
  const extraToday = readingToday ? Math.max(0, readToday - basePace) : readToday;
  const delta = finished ? 0 : readAtDayStart - expectedAtDayStart + extraToday;

  const todayGoal = finished || !readingToday ? 0 : Math.min(perDay, remainingAtDayStart);
  const targetFrom = dayStartPage;
  const targetTo = Math.min(totalPages, dayStartPage + Math.max(todayGoal, 1) - 1);

  // Projection uses the current pace (perDay) from the current page.
  let projectedFinish: string | null = null;
  if (!finished && perDay > 0) {
    const remainingNow = totalPages - currentPage + 1;
    const leftToday = readingToday ? Math.max(0, todayGoal - readToday) : 0;
    if (remainingNow <= leftToday) projectedFinish = today;
    else {
      const afterToday = remainingNow - leftToday;
      projectedFinish = nthReadingDay(mask, addDays(today, 1), Math.ceil(afterToday / perDay));
    }
  }

  return {
    today,
    isReadingDay: readingToday,
    todayGoal,
    targetFrom,
    targetTo,
    readToday,
    todayDone: todayGoal === 0 || readToday >= todayGoal,
    delta,
    projectedFinish,
    finished,
    overdue,
  };
}
