// Called daily by Vercel Cron (see vercel.json). Removes Blob copies of books not read recently.
import { cleanupCache, blobEnabled } from "@/lib/blob-cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!blobEnabled()) return Response.json({ skipped: "blob not configured" });
  const ttl = Number(process.env.BLOB_TTL_DAYS || 3);
  return Response.json(await cleanupCache(ttl));
}
