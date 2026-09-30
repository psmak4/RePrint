CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"alternate_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"bio" text,
	"birth_date" date,
	"death_date" date,
	"photo_id" uuid,
	"field_origins" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"first_published_year" integer,
	"original_language" text,
	"primary_edition_id" uuid,
	"cover_id" uuid,
	"field_origins" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_vector" "tsvector",
	"review_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_counts" integer[] DEFAULT '{0,0,0,0,0}'::integer[] NOT NULL,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_slug_unique" UNIQUE("slug"),
	CONSTRAINT "books_rating_counts_check" CHECK (array_length("books"."rating_counts", 1) = 5),
	CONSTRAINT "books_review_count_check" CHECK ("books"."review_count" >= 0 and "books"."rating_sum" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"book_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"role" text NOT NULL,
	"position" integer,
	CONSTRAINT "contributions_book_id_author_id_role_pk" PRIMARY KEY("book_id","author_id","role"),
	CONSTRAINT "contributions_role_check" CHECK ("contributions"."role" in ('author', 'co_author', 'translator', 'illustrator', 'editor', 'narrator', 'other'))
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"isbn_13" text,
	"format" text DEFAULT 'unknown' NOT NULL,
	"language" text,
	"publisher_name" text,
	"published_date" date,
	"page_count" integer,
	"cover_id" uuid,
	"field_origins" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_isbn_13_unique" UNIQUE("isbn_13"),
	CONSTRAINT "editions_isbn_13_check" CHECK ("editions"."isbn_13" ~ '^[0-9]{13}$'),
	CONSTRAINT "editions_format_check" CHECK ("editions"."format" in ('hardcover', 'paperback', 'ebook', 'audiobook', 'unknown')),
	CONSTRAINT "editions_page_count_check" CHECK ("editions"."page_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "source_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_links_entity_type_check" CHECK ("source_links"."entity_type" in ('book', 'edition', 'author', 'series'))
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_photo_id_covers_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."covers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_primary_edition_id_editions_id_fk" FOREIGN KEY ("primary_edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_cover_id_covers_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."covers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_cover_id_covers_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."covers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authors_name_trgm_idx" ON "authors" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "authors_photo_id_idx" ON "authors" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "books_search_vector_idx" ON "books" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "books_title_trgm_idx" ON "books" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "books_primary_edition_id_idx" ON "books" USING btree ("primary_edition_id");--> statement-breakpoint
CREATE INDEX "books_cover_id_idx" ON "books" USING btree ("cover_id");--> statement-breakpoint
CREATE INDEX "contributions_author_id_idx" ON "contributions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "editions_book_id_idx" ON "editions" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "editions_cover_id_idx" ON "editions" USING btree ("cover_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_links_source_entity_type_source_id_idx" ON "source_links" USING btree ("source","entity_type","source_id");--> statement-breakpoint
CREATE INDEX "source_links_entity_idx" ON "source_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "source_records_source_source_id_idx" ON "source_records" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "source_records_fetched_at_idx" ON "source_records" USING btree ("fetched_at");