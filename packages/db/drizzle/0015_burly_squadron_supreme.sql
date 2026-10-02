CREATE TABLE "book_slug_redirects" (
	"slug" text PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_slug_redirects" ADD CONSTRAINT "book_slug_redirects_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_slug_redirects_book_id_idx" ON "book_slug_redirects" USING btree ("book_id");