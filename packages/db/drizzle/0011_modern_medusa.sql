CREATE TABLE "shelf_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"shelf" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelf_entries_user_id_book_id_unique" UNIQUE("user_id","book_id"),
	CONSTRAINT "shelf_entries_shelf_check" CHECK ("shelf_entries"."shelf" in ('want_to_read', 'reading', 'read'))
);
--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shelf_entries_book_id_idx" ON "shelf_entries" USING btree ("book_id");