CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
--> statement-breakpoint
-- Append-only (PRD §9, D-037). Rows are never deleted and never edited, with two exceptions that
-- only ever remove personal data: `ip` set to NULL once the row is 90 days old (D-042), and
-- `actor_id` set to NULL when the actor's account is erased (the FK's ON DELETE SET NULL).
CREATE FUNCTION audit_log_guard() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'audit_log is append-only: DELETE is not allowed' USING ERRCODE = 'restrict_violation';
	END IF;
	IF (NEW.id, NEW.action, NEW.target_type, NEW.target_id, NEW.before, NEW.after, NEW.created_at)
		IS DISTINCT FROM
		(OLD.id, OLD.action, OLD.target_type, OLD.target_id, OLD.before, OLD.after, OLD.created_at)
		OR (NEW.actor_id IS DISTINCT FROM OLD.actor_id AND NEW.actor_id IS NOT NULL)
		OR (NEW.ip IS DISTINCT FROM OLD.ip AND (NEW.ip IS NOT NULL OR OLD.created_at > now() - interval '90 days'))
	THEN
		RAISE EXCEPTION 'audit_log is append-only: UPDATE is not allowed' USING ERRCODE = 'restrict_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
	BEFORE UPDATE OR DELETE ON audit_log
	FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
