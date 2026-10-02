CREATE TABLE "review_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reports_review_id_reporter_id_unique" UNIQUE("review_id","reporter_id"),
	CONSTRAINT "review_reports_reason_check" CHECK ("review_reports"."reason" in ('unmarked_spoiler', 'offensive', 'spam', 'off_topic', 'other')),
	CONSTRAINT "review_reports_status_check" CHECK ("review_reports"."status" in ('open', 'dismissed', 'actioned')),
	CONSTRAINT "review_reports_note_length_check" CHECK (char_length("review_reports"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_reports_reporter_id_idx" ON "review_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "review_reports_resolved_by_idx" ON "review_reports" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "review_reports_open_queue_idx" ON "review_reports" USING btree ("created_at") WHERE "review_reports"."status" = 'open';