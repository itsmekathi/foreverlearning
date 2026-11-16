import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** One row per PDF found in the Git repository. Book-level data, shared by all users. */
export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(), // path inside the repo
  title: text("title").notNull(),
  author: text("author"),
  sha: text("sha").notNull(), // git blob sha (or LFS oid) — changes when the file changes
  size: bigint("size", { mode: "number" }).notNull(), // real byte size of the PDF
  lfs: boolean("lfs").notNull().default(false),
  pageCount: integer("page_count"),
  outlineSeeded: boolean("outline_seeded").notNull().default(false),
  missing: boolean("missing").notNull().default(false), // removed from the repo
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Chapters from the PDF outline (or added by hand). */
export const chapters = pgTable(
  "chapters",
  {
    id: serial("id").primaryKey(),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    title: text("title").notNull(),
    depth: integer("depth").notNull().default(0),
    startPage: integer("start_page").notNull(),
    endPage: integer("end_page").notNull(),
    manual: boolean("manual").notNull().default(false),
  },
  (t) => [index("chapters_book_idx").on(t.bookId)],
);

export const chapterCovered = pgTable(
  "chapter_covered",
  {
    userId: text("user_id").notNull(),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    coveredAt: timestamp("covered_at", { withTimezone: true }).notNull().defaultNow(),
    manual: boolean("manual").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.chapterId] })],
);

export const progress = pgTable(
  "progress",
  {
    userId: text("user_id").notNull(),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    page: integer("page").notNull().default(1),
    offset: real("offset").notNull().default(0), // 0..1 position within the page
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bookId] })],
);

export const plans = pgTable(
  "plans",
  {
    userId: text("user_id").notNull(),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["date", "pace"] }).notNull(),
    startDate: date("start_date").notNull(),
    startPage: integer("start_page").notNull().default(1),
    targetDate: date("target_date"),
    pagesPerDay: integer("pages_per_day"),
    readingDays: integer("reading_days").notNull().default(127), // bitmask, bit 0 = Sunday
  },
  (t) => [primaryKey({ columns: [t.userId, t.bookId] })],
);

export type HighlightRect = { x: number; y: number; w: number; h: number }; // fractions of page size

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    kind: text("kind", { enum: ["bookmark", "note", "highlight"] }).notNull(),
    text: text("text"),
    quote: text("quote"),
    rects: jsonb("rects").$type<HighlightRect[]>(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_user_book_idx").on(t.userId, t.bookId)],
);

export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: uuid("id").primaryKey(), // generated on the client so repeated saves are idempotent
    userId: text("user_id").notNull(),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    localDate: date("local_date").notNull(), // reader's calendar day, for streaks
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    startPage: integer("start_page").notNull(),
    endPage: integer("end_page").notNull(),
    pagesRead: integer("pages_read").notNull().default(0),
  },
  (t) => [index("sessions_user_date_idx").on(t.userId, t.localDate)],
);

/** Temporary copies of repo PDFs in Vercel Blob, deleted by the cleanup cron. */
export const blobCache = pgTable("blob_cache", {
  sha: text("sha").primaryKey(),
  status: text("status", { enum: ["pending", "ready"] }).notNull(),
  url: text("url"),
  size: bigint("size", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastAccessed: timestamp("last_accessed", { withTimezone: true }).notNull().defaultNow(),
});

export type Book = typeof books.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Plan = typeof plans.$inferSelect;
