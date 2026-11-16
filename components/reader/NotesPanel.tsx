"use client";
import { useState } from "react";
import type { HighlightRect } from "@/lib/db/schema";

export type ClientNote = {
  id: number;
  page: number;
  kind: "bookmark" | "note" | "highlight";
  text: string | null;
  quote: string | null;
  rects: HighlightRect[] | null;
  color: string | null;
  createdAt: string;
};

export type NoteDraft = { page: number; quote?: string; rects?: HighlightRect[] };

const KIND_ICON = { bookmark: "★", note: "✎", highlight: "▍" } as const;

export function NotesPanel({
  notes,
  currentPage,
  draft,
  onStartNote,
  onCancelDraft,
  onSaveDraft,
  onDelete,
  onJump,
}: {
  notes: ClientNote[];
  currentPage: number;
  draft: NoteDraft | null;
  onStartNote: () => void;
  onCancelDraft: () => void;
  onSaveDraft: (text: string) => Promise<void>;
  onDelete: (id: number) => void;
  onJump: (page: number) => void;
}) {
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"all" | ClientNote["kind"]>("all");
  const sorted = [...notes]
    .filter((n) => filter === "all" || n.kind === filter)
    .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="p-4">
      {draft ? (
        <form
          className="mb-4 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSaveDraft(text.trim());
            setText("");
          }}
        >
          <div className="text-xs text-muted">Note on page {draft.page}</div>
          {draft.quote && (
            <blockquote className="border-l-4 border-yellow-300 pl-3 text-sm italic text-muted">{draft.quote}</blockquote>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Your thoughts…"
            className="w-full rounded-lg border border-line bg-transparent p-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancelDraft} className="rounded-lg px-3 py-2 text-sm hover:bg-hover">
              Cancel
            </button>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">Save</button>
          </div>
        </form>
      ) : (
        <button
          onClick={onStartNote}
          className="mb-4 w-full rounded-lg border border-dashed border-line py-2 text-sm text-muted hover:bg-hover"
        >
          + Add a note on page {currentPage}
        </button>
      )}

      <div className="mb-3 flex gap-1 text-xs">
        {(["all", "highlight", "note", "bookmark"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 capitalize ${filter === f ? "bg-accent text-white" : "bg-hover"}`}
          >
            {f === "all" ? "All" : `${f}s`}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Nothing yet. Select text on a page to highlight it, or tap ☆ to bookmark.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((n) => (
            <li key={n.id} className="flex gap-3 py-3">
              <button onClick={() => onJump(n.page)} className="min-w-0 flex-1 text-left">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <span className={n.kind === "highlight" ? "text-yellow-500" : ""}>{KIND_ICON[n.kind]}</span>
                  <span>Page {n.page}</span>
                </div>
                {n.quote && <p className="line-clamp-3 text-sm italic">“{n.quote}”</p>}
                {n.text && <p className="mt-1 whitespace-pre-wrap text-sm">{n.text}</p>}
                {n.kind === "bookmark" && !n.text && <p className="text-sm">Bookmark</p>}
              </button>
              <button
                onClick={() => onDelete(n.id)}
                className="self-start rounded-lg px-2 py-1 text-xs text-muted hover:bg-hover"
                aria-label="Delete"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
