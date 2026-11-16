"use client";
import { useEffect, useRef, useState } from "react";
import { getCover, type BookRef } from "@/lib/pdf/load";

/** First-page thumbnail, rendered on demand (only page 1's bytes are fetched) and cached on device. */
export function Cover({ book, title }: { book: BookRef; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        getCover(book).then((url) => {
          if (cancelled) return;
          if (url) setSrc(url);
          else setFailed(true);
        });
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [book]);

  return (
    <div ref={ref} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-hover">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        <div className={`flex h-full items-end p-3 text-sm font-medium leading-snug text-muted ${failed ? "" : "animate-pulse"}`}>
          {title}
        </div>
      )}
    </div>
  );
}
