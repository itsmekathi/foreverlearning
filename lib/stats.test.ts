import { describe, expect, it } from "vitest";
import { dailyTotals, streaks, totalsByBook, type SessionLike } from "./stats";

const s = (localDate: string, pagesRead = 5, mins = 10, bookId = 1): SessionLike => ({
  bookId,
  localDate,
  startedAt: new Date(`${localDate}T10:00:00Z`),
  endedAt: new Date(new Date(`${localDate}T10:00:00Z`).getTime() + mins * 60_000),
  pagesRead,
});

describe("streaks", () => {
  it("counts consecutive days ending today", () => {
    const r = streaks([s("2026-11-14"), s("2026-11-15"), s("2026-11-16")], "2026-11-16");
    expect(r).toEqual({ current: 3, longest: 3, readToday: true });
  });

  it("keeps the streak alive until today is over", () => {
    const r = streaks([s("2026-11-14"), s("2026-11-15")], "2026-11-16");
    expect(r.current).toBe(2);
    expect(r.readToday).toBe(false);
  });

  it("breaks after a missed day and tracks the longest run", () => {
    const r = streaks(
      [s("2026-11-01"), s("2026-11-02"), s("2026-11-03"), s("2026-11-04"), s("2026-11-14")],
      "2026-11-16",
    );
    expect(r.current).toBe(0);
    expect(r.longest).toBe(4);
  });

  it("ignores accidental opens (no pages, under a minute)", () => {
    const r = streaks([s("2026-11-15", 0, 0.5), s("2026-11-16")], "2026-11-16");
    expect(r.current).toBe(1);
  });

  it("handles month boundaries", () => {
    const r = streaks([s("2026-10-31"), s("2026-11-01")], "2026-11-01");
    expect(r.current).toBe(2);
  });
});

describe("aggregates", () => {
  it("fills empty days with zeros", () => {
    const d = dailyTotals([s("2026-11-16", 7, 20), s("2026-11-16", 3, 10)], "2026-11-16", 3);
    expect(d).toEqual([
      { date: "2026-11-14", pages: 0, minutes: 0 },
      { date: "2026-11-15", pages: 0, minutes: 0 },
      { date: "2026-11-16", pages: 10, minutes: 30 },
    ]);
  });

  it("totals per book, most time first", () => {
    const t = totalsByBook([s("2026-11-15", 5, 10, 1), s("2026-11-16", 5, 50, 2), s("2026-11-16", 2, 5, 1)]);
    expect(t.map((x) => [x.bookId, x.minutes, x.pages, x.lastRead])).toEqual([
      [2, 50, 5, "2026-11-16"],
      [1, 15, 7, "2026-11-16"],
    ]);
  });
});
