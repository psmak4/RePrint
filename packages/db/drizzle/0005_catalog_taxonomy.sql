CREATE TABLE "book_genres" (
	"book_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	"origin" text DEFAULT 'mapping' NOT NULL,
	CONSTRAINT "book_genres_book_id_genre_id_pk" PRIMARY KEY("book_id","genre_id"),
	CONSTRAINT "book_genres_origin_check" CHECK ("book_genres"."origin" in ('mapping', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "book_series" (
	"book_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"position" numeric,
	CONSTRAINT "book_series_book_id_series_id_pk" PRIMARY KEY("book_id","series_id"),
	CONSTRAINT "book_series_position_check" CHECK ("book_series"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "book_subjects" (
	"book_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "book_subjects_book_id_subject_id_pk" PRIMARY KEY("book_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genres_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "merge_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_a_id" uuid NOT NULL,
	"book_b_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merge_candidates_pair_unique" UNIQUE("book_a_id","book_b_id"),
	CONSTRAINT "merge_candidates_distinct_check" CHECK ("merge_candidates"."book_a_id" <> "merge_candidates"."book_b_id"),
	CONSTRAINT "merge_candidates_status_check" CHECK ("merge_candidates"."status" in ('pending', 'merged', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"field_origins" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subject_genre_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pattern" text NOT NULL,
	"genre_id" uuid NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_genre_rules_pattern_genre_id_unique" UNIQUE("pattern","genre_id"),
	CONSTRAINT "subject_genre_rules_pattern_check" CHECK (length(trim("subject_genre_rules"."pattern")) > 0)
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" "citext" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_label_unique" UNIQUE("label")
);
--> statement-breakpoint
ALTER TABLE "book_genres" ADD CONSTRAINT "book_genres_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_genres" ADD CONSTRAINT "book_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_series" ADD CONSTRAINT "book_series_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_series" ADD CONSTRAINT "book_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_subjects" ADD CONSTRAINT "book_subjects_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_subjects" ADD CONSTRAINT "book_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genres" ADD CONSTRAINT "genres_parent_id_genres_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."genres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_candidates" ADD CONSTRAINT "merge_candidates_book_a_id_books_id_fk" FOREIGN KEY ("book_a_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_candidates" ADD CONSTRAINT "merge_candidates_book_b_id_books_id_fk" FOREIGN KEY ("book_b_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_genre_rules" ADD CONSTRAINT "subject_genre_rules_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_genres_genre_id_idx" ON "book_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "book_series_series_id_idx" ON "book_series" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "book_subjects_subject_id_idx" ON "book_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "genres_parent_id_idx" ON "genres" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "merge_candidates_book_a_id_idx" ON "merge_candidates" USING btree ("book_a_id");--> statement-breakpoint
CREATE INDEX "merge_candidates_book_b_id_idx" ON "merge_candidates" USING btree ("book_b_id");--> statement-breakpoint
CREATE INDEX "merge_candidates_status_idx" ON "merge_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subject_genre_rules_genre_id_idx" ON "subject_genre_rules" USING btree ("genre_id");