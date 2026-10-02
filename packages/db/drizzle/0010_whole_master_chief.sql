CREATE TABLE "featured_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "featured_items_kind_ref_id_unique" UNIQUE("kind","ref_id"),
	CONSTRAINT "featured_items_kind_check" CHECK ("featured_items"."kind" in ('genre', 'review'))
);
