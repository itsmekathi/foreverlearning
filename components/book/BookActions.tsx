"use client";
import { useTransition } from "react";
import { setFinished } from "@/app/actions";

export function BookActions({ bookId, finished, started }: { bookId: number; finished: boolean; started: boolean }) {
  const [pending, start] = useTransition();
  return (
    <>
      {!finished && (
        <button
          disabled={pending}
          onClick={() => start(() => setFinished(bookId, true))}
          className="rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-hover disabled:opacity-60"
        >
          Mark finished
        </button>
      )}
      {(finished || started) && (
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Reset progress to page 1 and clear covered chapters?")) start(() => setFinished(bookId, false));
          }}
          className="rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-hover disabled:opacity-60"
        >
          Restart
        </button>
      )}
    </>
  );
}
