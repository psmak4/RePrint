-- Extensions PRD §8 and §6 rely on. Idempotent: docker/postgres/init.sql (local) may have created them
-- already, and managed databases (Neon) need them enabled here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
