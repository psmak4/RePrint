CREATE TABLE "review_claims" (
	"review_id" uuid PRIMARY KEY NOT NULL,
	"moderator_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"rating" integer NOT NULL,
	"headline" text,
	"body" text NOT NULL,
	"has_spoilers" boolean DEFAULT false NOT NULL,
	"edition_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_versions_rating_check" CHECK ("review_versions"."rating" between 1 and 5),
	CONSTRAINT "review_versions_status_check" CHECK ("review_versions"."status" in ('pending', 'approved', 'rejected', 'unpublished')),
	CONSTRAINT "review_versions_version_check" CHECK ("review_versions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"headline" text,
	"body" text NOT NULL,
	"has_spoilers" boolean DEFAULT false NOT NULL,
	"edition_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_user_id_book_id_unique" UNIQUE("user_id","book_id"),
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_status_check" CHECK ("reviews"."status" in ('pending', 'approved', 'rejected', 'unpublished')),
	CONSTRAINT "reviews_headline_length_check" CHECK (char_length("reviews"."headline") <= 120),
	CONSTRAINT "reviews_body_length_check" CHECK (char_length("reviews"."body") between 50 and 10000),
	CONSTRAINT "reviews_helpful_count_check" CHECK ("reviews"."helpful_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "review_claims" ADD CONSTRAINT "review_claims_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_claims" ADD CONSTRAINT "review_claims_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_versions" ADD CONSTRAINT "review_versions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_versions" ADD CONSTRAINT "review_versions_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_versions" ADD CONSTRAINT "review_versions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_claims_moderator_id_idx" ON "review_claims" USING btree ("moderator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_versions_review_id_version_idx" ON "review_versions" USING btree ("review_id","version");--> statement-breakpoint
CREATE INDEX "review_versions_decided_by_idx" ON "review_versions" USING btree ("decided_by");--> statement-breakpoint
CREATE INDEX "review_versions_edition_id_idx" ON "review_versions" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "reviews_book_id_status_idx" ON "reviews" USING btree ("book_id","status");--> statement-breakpoint
CREATE INDEX "reviews_edition_id_idx" ON "reviews" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "reviews_pending_queue_idx" ON "reviews" USING btree ("submitted_at") WHERE "reviews"."status" = 'pending';