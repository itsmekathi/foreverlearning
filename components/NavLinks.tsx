"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Library", icon: "▤" },
  { href: "/stats", label: "Progress", icon: "▲" },
];

export function NavLinks({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname();
  return LINKS.map((l) => {
    const active = l.href === "/" ? path === "/" || path.startsWith("/book") : path.startsWith(l.href);
    return variant === "top" ? (
      <Link
        key={l.href}
        href={l.href}
        className={`rounded-lg px-3 py-1.5 text-sm ${active ? "bg-hover font-medium" : "text-muted hover:bg-hover"}`}
      >
        {l.label}
      </Link>
    ) : (
      <Link
        key={l.href}
        href={l.href}
        className={`flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${active ? "text-accent" : "text-muted"}`}
      >
        <span className="text-lg leading-none">{l.icon}</span>
        {l.label}
      </Link>
    );
  });
}
