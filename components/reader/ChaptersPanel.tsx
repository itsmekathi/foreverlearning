"use client";

export type ClientChapter = {
  id: number;
  title: string;
  depth: number;
  startPage: number;
  endPage: number;
  covered: boolean;
};

export function ChaptersPanel({
  chapters,
  covered,
  currentPage,
  onJump,
  onToggle,
}: {
  chapters: ClientChapter[];
  covered: Set<number>;
  currentPage: number;
  onJump: (page: number) => void;
  onToggle: (id: number, covered: boolean) => void;
}) {
  if (!chapters.length) {
    return (
      <p className="p-4 text-sm text-muted">
        This PDF has no table of contents. You can add chapters by hand on the book&apos;s page.
      </p>
    );
  }
  const done = chapters.filter((c) => covered.has(c.id)).length;
  return (
    <div>
      <p className="px-4 pt-3 text-xs text-muted">
        {done} of {chapters.length} covered
      </p>
      <ul className="py-1">
        {chapters.map((c) => {
          const here = currentPage >= c.startPage && currentPage <= c.endPage;
          const isCovered = covered.has(c.id);
          return (
            <li key={c.id} className={`flex items-center gap-2 pr-3 ${here ? "bg-accent/10" : ""}`}>
              <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center">
                <input
                  type="checkbox"
                  checked={isCovered}
                  onChange={(e) => onToggle(c.id, e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                  aria-label={`Mark "${c.title}" covered`}
                />
              </label>
              <button
                onClick={() => onJump(c.startPage)}
                className="flex min-w-0 flex-1 items-baseline gap-2 py-2 text-left"
                style={{ paddingLeft: c.depth * 14 }}
              >
                <span className={`min-w-0 flex-1 truncate text-sm ${isCovered ? "text-muted line-through" : ""} ${c.depth === 0 ? "font-medium" : ""}`}>
                  {c.title}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">p.{c.startPage}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
