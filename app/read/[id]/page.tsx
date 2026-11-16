import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, books } from "@/lib/db";
import { requireUser, userToday } from "@/lib/session";
import { getBookDetail } from "@/lib/queries";
import { Reader } from "@/components/reader/Reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [b] = await getDb().select({ title: books.title }).from(books).where(eq(books.id, Number((await params).id)));
  return { title: b?.title ?? "Reading" };
}

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const userId = await requireUser();
  const id = Number((await params).id);
  const jump = Number((await searchParams).page) || null;
  const d = await getBookDetail(userId, id, await userToday());
  if (!d) notFound();

  return (
    <Reader
      book={{
        id: d.book.id,
        title: d.book.title,
        sha: d.book.sha,
        size: d.book.size,
        pageCount: d.book.pageCount,
        outlineSeeded: d.book.outlineSeeded,
      }}
      initial={{
        page: d.progress?.page ?? 1,
        offset: d.progress?.offset ?? 0,
        updatedAt: d.progress?.updatedAt?.toISOString() ?? null,
      }}
      jumpTo={jump}
      chapters={d.chapters}
      notes={d.notes}
    />
  );
}
