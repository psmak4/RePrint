-- Runs once, when the postgres volume is first created (docker-entrypoint-initdb.d).
-- Extensions used by search (pg_trgm, unaccent) and case-insensitive columns (citext).
-- The first Drizzle migration (M1-T05) enables them again with IF NOT EXISTS, so managed
-- databases without this script work too.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;
