ALTER TABLE "authors" ADD COLUMN "bibliography_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "source_book_count" integer;