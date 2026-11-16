"use client";
import { useState, useTransition } from "react";
import { syncLibrary } from "@/app/actions";

export function SyncButton({ primary = false }: { primary?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-muted">{msg}</span>}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncLibrary();
            setMsg(
              r.error
                ? `Sync failed: ${r.error.slice(0, 120)}`
                : r.added + r.updated + r.removed === 0
                  ? "Up to date"
                  : `${r.added} new · ${r.updated} updated · ${r.removed} removed`,
            );
          })
        }
        className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60 ${
          primary ? "bg-accent text-white" : "border border-line hover:bg-hover"
        }`}
      >
        {pending ? "Syncing…" : "Sync from repo"}
      </button>
    </div>
  );
}
