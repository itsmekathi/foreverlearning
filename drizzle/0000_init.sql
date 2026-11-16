CREATE TABLE "blob_cache" (
	"sha" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"url" text,
	"size" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"sha" text NOT NULL,
	"size" bigint NOT NULL,
	"lfs" boolean DEFAULT false NOT NULL,
	"page_count" integer,
	"outline_seeded" boolean DEFAULT false NOT NULL,
	"missing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "chapter_covered" (
	"user_id" text NOT NULL,
	"chapter_id" integer NOT NULL,
	"covered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	CONSTRAINT "chapter_covered_user_id_chapter_id_pk" PRIMARY KEY("user_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"idx" integer NOT NULL,
	"title" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"start_page" integer NOT NULL,
	"end_page" integer NOT NULL,
	"manual" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"page" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"quote" text,
	"rects" jsonb,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"user_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"mode" text NOT NULL,
	"start_date" date NOT NULL,
	"start_page" integer DEFAULT 1 NOT NULL,
	"target_date" date,
	"pages_per_day" integer,
	"reading_days" integer DEFAULT 127 NOT NULL,
	CONSTRAINT "plans_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"user_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"page" integer DEFAULT 1 NOT NULL,
	"offset" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "progress_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"start_page" integer NOT NULL,
	"end_page" integer NOT NULL,
	"pages_read" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_covered" ADD CONSTRAINT "chapter_covered_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapters_book_idx" ON "chapters" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "notes_user_book_idx" ON "notes" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "sessions_user_date_idx" ON "reading_sessions" USING btree ("user_id","local_date");