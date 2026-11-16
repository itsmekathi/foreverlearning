import { describe, expect, it } from "vitest";
import { computePlan, countReadingDays, nthReadingDay, type PlanInput } from "./plan";

const WEEKDAYS = 0b0111110; // Mon–Fri

const datePlan = (over: Partial<PlanInput> = {}): PlanInput => ({
  mode: "date",
  startDate: "2026-11-02", // Monday
  startPage: 1,
  targetDate: "2026-11-11", // Wednesday next week
  pagesPerDay: null,
  readingDays: 0b1111111,
  ...over,
});

describe("countReadingDays / nthReadingDay", () => {
  it("counts every day with the full mask", () => {
    expect(countReadingDays(0b1111111, "2026-11-02", "2026-11-11")).toBe(10);
  });
  it("skips weekends with a Mon–Fri mask", () => {
    // Mon 2 .. Wed 11 → 8 weekdays
    expect(countReadingDays(WEEKDAYS, "2026-11-02", "2026-11-11")).toBe(8);
  });
  it("returns 0 for an empty range", () => {
    expect(countReadingDays(WEEKDAYS, "2026-11-05", "2026-11-04")).toBe(0);
  });
  it("finds the n-th reading day, skipping weekends", () => {
    expect(nthReadingDay(WEEKDAYS, "2026-11-06", 1)).toBe("2026-11-06"); // Fri
    expect(nthReadingDay(WEEKDAYS, "2026-11-06", 2)).toBe("2026-11-09"); // next Mon
  });
});

describe("computePlan (target date)", () => {
  it("spreads pages evenly on day one", () => {
    const s = computePlan(datePlan(), 100, 1, 1, "2026-11-02");
    expect(s.todayGoal).toBe(10);
    expect(s.targetFrom).toBe(1);
    expect(s.targetTo).toBe(10);
    expect(s.delta).toBe(0);
    expect(s.todayDone).toBe(false);
  });

  it("keeps today's goal fixed while reading and marks it done", () => {
    const s = computePlan(datePlan(), 100, 12, 1, "2026-11-02");
    expect(s.todayGoal).toBe(10);
    expect(s.readToday).toBe(11);
    expect(s.todayDone).toBe(true);
    expect(s.delta).toBe(1); // one page beyond today's share
  });

  it("re-spreads after a missed day instead of piling up", () => {
    // Day 3 (Nov 4), still on page 1: 100 pages over 8 remaining days → 13/day, 20 behind.
    const s = computePlan(datePlan(), 100, 1, 1, "2026-11-04");
    expect(s.todayGoal).toBe(13);
    expect(s.delta).toBe(-20);
  });

  it("gives a zero goal on rest days", () => {
    const s = computePlan(datePlan({ readingDays: WEEKDAYS }), 80, 1, 1, "2026-11-07"); // Saturday
    expect(s.isReadingDay).toBe(false);
    expect(s.todayGoal).toBe(0);
    expect(s.todayDone).toBe(true);
  });

  it("flags overdue plans", () => {
    const s = computePlan(datePlan(), 100, 50, 50, "2026-11-20");
    expect(s.overdue).toBe(true);
    expect(s.todayGoal).toBe(51);
  });

  it("reports finished books", () => {
    const s = computePlan(datePlan(), 100, 100, 90, "2026-11-05");
    expect(s.finished).toBe(true);
    expect(s.todayGoal).toBe(0);
    expect(s.projectedFinish).toBeNull();
  });
});

describe("computePlan (pages per day)", () => {
  const pace: PlanInput = {
    mode: "pace",
    startDate: "2026-11-02",
    startPage: 1,
    targetDate: null,
    pagesPerDay: 20,
    readingDays: 0b1111111,
  };

  it("projects the finish date", () => {
    const s = computePlan(pace, 100, 1, 1, "2026-11-02");
    expect(s.todayGoal).toBe(20);
    expect(s.projectedFinish).toBe("2026-11-06"); // 5 days of 20
  });

  it("computes ahead/behind against the fixed pace", () => {
    const s = computePlan(pace, 100, 31, 31, "2026-11-04"); // 2 days elapsed → expected 40, read 30
    expect(s.delta).toBe(-10);
  });
});
