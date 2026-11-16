// Streams byte ranges of a book's PDF. The reader only asks for the ranges it needs for
// the pages on screen, so a 300 MB book costs a few hundred KB per page turn.
//
// Source order: Vercel Blob cached copy → GitHub (and start caching into Blob in the background).
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, books } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { fetchFromGitHub } from "@/lib/github";
import { blobEnabled, dropCache, getReadyCache, touchCache, warmCache } from "@/lib/blob-cache";

export const runtime = "nodejs";
export const maxDuration = 300; // room for the background copy into Blob

const PASS_HEADERS = ["content-length", "content-range", "accept-ranges"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const [book] = await getDb().select().from(books).where(eq(books.id, Number(id)));
  if (!book) return new Response("Not found", { status: 404 });

  const range = req.headers.get("range");
  let upstream: Response | null = null;

  const cached = blobEnabled() ? await getReadyCache(book.sha) : null;
  if (cached?.url) {
    const res = await fetch(cached.url, { headers: range ? { Range: range } : {}, cache: "no-store" });
    if (res.ok) {
      upstream = res;
      after(() => touchCache(cached));
    } else {
      after(() => dropCache(book.sha, cached.url)); // blob vanished; fall back and re-cache
    }
  }

  if (!upstream) {
    upstream = await fetchFromGitHub(book.path, book.lfs, range);
    if (!upstream.ok) {
      return new Response(`Upstream error ${upstream.status}`, { status: 502 });
    }
    after(() => warmCache(book));
  }

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Cache-Control": "private, max-age=86400, immutable", // content is pinned by sha in the URL
    "X-Book-Source": cached ? "blob" : "github",
  });
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
