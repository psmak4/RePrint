CREATE TABLE "covers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"origin_ref" text,
	"r2_key" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "covers_r2_key_unique" UNIQUE("r2_key"),
	CONSTRAINT "covers_origin_check" CHECK ("covers"."origin" in ('open_library', 'upload')),
	CONSTRAINT "covers_upload_key_check" CHECK ("covers"."origin" <> 'upload' or "covers"."r2_key" is not null)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_covers_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."covers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_avatar_id_idx" ON "users" USING btree ("avatar_id");