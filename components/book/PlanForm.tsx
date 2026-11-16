"use client";
import { useMemo, useState, useTransition } from "react";
import { deletePlan, savePlan } from "@/app/actions";
import { ALL_DAYS, WEEKDAY_NAMES, countReadingDays, nthReadingDay } from "@/lib/plan";
import { addDays, formatDay } from "@/lib/dates";

type PlanProps = {
  mode: "date" | "pace";
  targetDate: string | null;
  pagesPerDay: number | null;
  readingDays: number;
} | null;

export function PlanForm({
  bookId,
  today,
  totalPages,
  currentPage,
  plan,
}: {
  bookId: number;
  today: string;
  totalPages: number;
  currentPage: number;
  plan: PlanProps;
}) {
  const [editing, setEditing] = useState(!plan);
  const [mode, setMode] = useState<"date" | "pace">(plan?.mode ?? "date");
  const [target, setTarget] = useState(plan?.targetDate ?? addDays(today, 30));
  const [ppd, setPpd] = useState(plan?.pagesPerDay ?? 15);
  const [mask, setMask] = useState(plan?.readingDays ?? ALL_DAYS);
  const [pending, start] = useTransition();

  const remaining = Math.max(0, totalPages - currentPage + 1);
  const preview = useMemo(() => {
    if (mode === "date") {
      const days = countReadingDays(mask, today, target);
      return days > 0 ? `≈ ${Math.ceil(remaining / days)} pages per reading day (${days} days)` : "Pick a later date";
    }
    const days = Math.ceil(remaining / Math.max(1, ppd));
    return `Finish around ${formatDay(nthReadingDay(mask, today, days))} (${days} reading days)`;
  }, [mode, mask, today, target, ppd, remaining]);

  if (!editing && plan) {
    return (
      <div className="flex gap-2">
        <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-hover">
          Edit plan
        </button>
        <button
          disabled={pending}
          onClick={() => start(() => deletePlan(bookId))}
          className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-hover"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          await savePlan(bookId, fd);
          setEditing(false);
        })
      }
      className="space-y-4 text-sm"
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-hover p-1">
        {(["date", "pace"] as const).map((m) => (
          <label
            key={m}
            className={`cursor-pointer rounded-lg py-2 text-center ${mode === m ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
          >
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
            {m === "date" ? "Finish by a date" : "Pages per day"}
          </label>
        ))}
      </div>

      {mode === "date" ? (
        <label className="block">
          <span className="mb-1 block text-muted">Finish by</span>
          <input
            type="date"
            name="targetDate"
            min={addDays(today, 1)}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
            required
          />
        </label>
      ) : (
        <label className="block">
          <span className="mb-1 block text-muted">Pages per reading day</span>
          <input
            type="number"
            name="pagesPerDay"
            min={1}
            max={1000}
            inputMode="numeric"
            value={ppd}
            onChange={(e) => setPpd(Number(e.target.value))}
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
          />
        </label>
      )}

      <fieldset>
        <legend className="mb-1 text-muted">Reading days</legend>
        <div className="flex gap-1">
          {WEEKDAY_NAMES.map((d, i) => {
            const on = !!((mask >> i) & 1);
            return (
              <label
                key={d}
                className={`flex-1 cursor-pointer rounded-lg py-2 text-center text-xs ${on ? "bg-accent text-white" : "bg-hover text-muted"}`}
              >
                <input
                  type="checkbox"
                  name="days"
                  value={i}
                  checked={on}
                  onChange={() => setMask((m) => (m ^ (1 << i)) || m)}
                  className="sr-only"
                />
                {d.slice(0, 2)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="text-muted">
        {remaining} pages left from p.{currentPage}. {preview}
      </p>

      <div className="flex gap-2">
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-60">
          {pending ? "Saving…" : plan ? "Update plan" : "Start plan"}
        </button>
        {plan && (
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-muted hover:bg-hover">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
