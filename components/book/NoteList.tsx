"use client";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { deleteNote } from "@/app/actions";
import type { ClientNote } from "@/components/reader/NotesPanel";

export function NoteList({ bookId, notes }: { bookId: number; notes: ClientNote[] }) {
  const [list, remove] = useOptimistic(notes, (s, id: number) => s.filter((n) => n.id !== id));
  const [, start] = useTransition();

  if (list.length === 0) {
    return <p className="text-sm text-muted">Select text while reading to highlight it, or bookmark a page with ☆.</p>;
  }
  return (
    <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
      {list.map((n) => (
        <li key={n.id} className="group flex gap-3 py-3">
          <Link href={`/read/${bookId}?page=${n.page}`} className="min-w-0 flex-1">
            <div className="text-xs text-muted">
              {n.kind === "bookmark" ? "★ Bookmark" : n.kind === "highlight" ? "Highlight" : "Note"} · p.{n.page}
            </div>
            {n.quote && <p className="mt-1 line-clamp-3 border-l-4 border-yellow-300 pl-2 text-sm italic">{n.quote}</p>}
            {n.text && <p className="mt-1 whitespace-pre-wrap text-sm">{n.text}</p>}
          </Link>
          <button
            onClick={() =>
              start(async () => {
                remove(n.id);
                await deleteNote(bookId, n.id);
              })
            }
            className="self-start px-1 text-xs text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
            aria-label="Delete note"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
