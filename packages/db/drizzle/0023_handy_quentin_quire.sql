CREATE TABLE "source_ratings" (
	"source_link_id" uuid PRIMARY KEY NOT NULL,
	"average" numeric(3, 2) NOT NULL,
	"count" integer NOT NULL,
	"counts" integer[] NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_ratings_count_check" CHECK ("source_ratings"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "source_ratings" ADD CONSTRAINT "source_ratings_source_link_id_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."source_links"("id") ON DELETE cascade ON UPDATE no action;