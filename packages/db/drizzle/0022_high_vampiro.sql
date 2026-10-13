ALTER TABLE "authors" ADD COLUMN "works_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "source_work_count" integer;