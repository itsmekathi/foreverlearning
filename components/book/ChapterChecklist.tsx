"use client";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { addChapter, deleteChapter, toggleChapter } from "@/app/actions";

type Ch = { id: number; title: string; depth: number; startPage: number; endPage: number; manual: boolean; covered: boolean };

export function ChapterChecklist({
  bookId,
  chapters,
  currentPage,
  outlineSeeded,
}: {
  bookId: number;
  chapters: Ch[];
  currentPage: number;
  outlineSeeded: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(chapters, (s, u: { id: number; covered: boolean }) =>
    s.map((c) => (c.id === u.id ? { ...c, covered: u.covered } : c)),
  );
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const hasSub = chapters.some((c) => c.depth > 0);
  const visible = optimistic.filter((c) => showSub || c.depth === 0);

  return (
    <div>
      {chapters.length === 0 && (
        <p className="mb-3 text-sm text-muted">
          {outlineSeeded
            ? "This PDF has no table of contents. Add chapters to track what you've covered."
            : "Chapters load from the PDF's table of contents the first time you open it."}
        </p>
      )}
      {hasSub && (
        <label className="mb-2 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showSub} onChange={(e) => setShowSub(e.target.checked)} />
          Show sub-sections
        </label>
      )}
      <ul className="max-h-[420px] overflow-y-auto">
        {visible.map((c) => {
          const here = currentPage >= c.startPage && currentPage <= c.endPage;
          return (
            <li key={c.id} className={`group flex items-center gap-1 rounded-lg ${here ? "bg-accent/10" : ""}`}>
              <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center">
                <input
                  type="checkbox"
                  checked={c.covered}
                  onChange={(e) => {
                    const covered = e.target.checked;
                    start(async () => {
                      setOptimistic({ id: c.id, covered });
                      await toggleChapter(bookId, c.id, covered);
                    });
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                  aria-label={`Mark "${c.title}" covered`}
                />
              </label>
              <Link
                href={`/read/${bookId}?page=${c.startPage}`}
                className="flex min-w-0 flex-1 items-baseline gap-2 py-2 pr-2"
                style={{ paddingLeft: c.depth * 14 }}
              >
                <span className={`min-w-0 flex-1 truncate text-sm ${c.covered ? "text-muted line-through" : ""}`}>
                  {c.title}
                  {here && <span className="ml-2 text-xs text-accent no-underline">● reading</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {c.startPage}–{c.endPage}
                </span>
              </Link>
              {c.manual && (
                <button
                  onClick={() => start(() => deleteChapter(bookId, c.id))}
                  className="px-2 text-xs text-muted opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete chapter"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form
          action={(fd) =>
            start(async () => {
              await addChapter(bookId, fd);
              setAdding(false);
            })
          }
          className="mt-3 flex gap-2"
        >
          <input name="title" placeholder="Chapter title" required className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm" />
          <input
            name="startPage"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="Page"
            required
            defaultValue={currentPage}
            className="w-20 rounded-lg border border-line bg-transparent px-2 py-2 text-sm"
          />
          <button className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">Add</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 text-sm text-accent hover:underline">
          + Add chapter
        </button>
      )}
    </div>
  );
}
