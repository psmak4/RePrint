CREATE TABLE "source_ratings" (
	"book_id" uuid NOT NULL,
	"source" text NOT NULL,
	"average" numeric(3, 2) NOT NULL,
	"count" integer NOT NULL,
	"counts" integer[] NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_ratings_book_id_source_pk" PRIMARY KEY("book_id","source"),
	CONSTRAINT "source_ratings_count_check" CHECK ("source_ratings"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "source_ratings" ADD CONSTRAINT "source_ratings_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;