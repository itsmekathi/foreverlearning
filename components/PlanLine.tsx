import type { PlanStatus } from "@/lib/plan";
import { formatDay } from "@/lib/dates";

/** One-line summary of today's goal for a book. */
export function PlanLine({ s, compact = false }: { s: PlanStatus; compact?: boolean }) {
  if (s.finished) return <span className="text-accent">Finished 🎉</span>;
  const pace =
    s.overdue ? (
      <span className="text-red-600">Past target date</span>
    ) : s.delta <= -3 ? (
      <span className="text-amber-600">{-s.delta} pages behind</span>
    ) : s.delta >= 3 ? (
      <span className="text-accent">{s.delta} pages ahead</span>
    ) : (
      <span className="text-accent">On track</span>
    );

  const today = !s.isReadingDay
    ? "Rest day"
    : s.todayDone
      ? "Today's goal done ✓"
      : `Today: p.${s.targetFrom}–${s.targetTo} (${Math.max(0, s.todayGoal - s.readToday)} left)`;

  return (
    <span className="flex flex-wrap gap-x-2">
      <span>{today}</span>
      {!compact && <span className="text-muted">·</span>}
      {!compact && pace}
      {!compact && s.projectedFinish && <span className="text-muted">· finish {formatDay(s.projectedFinish)}</span>}
    </span>
  );
}
