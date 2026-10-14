-- Search text folding (M10-T01). `unaccent` is STABLE, so it cannot appear in an index expression;
-- these IMMUTABLE wrappers can, which lets trigram indexes serve Catalog search. Every name is
-- schema-qualified because index builds and restores run with an empty search_path. The unaccent
-- dictionary is looked up wherever the extension was installed.
DO $$
DECLARE
	ext_schema text := (
		SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
		WHERE e.extname = 'unaccent'
	);
BEGIN
	EXECUTE format(
		'CREATE OR REPLACE FUNCTION public.search_fold(text) RETURNS text '
		'LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT '
		'AS $f$ SELECT pg_catalog.lower(%1$I.unaccent(%2$L::regdictionary, $1)) $f$',
		ext_schema,
		quote_ident(ext_schema) || '.unaccent'
	);
END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.search_fold_names(text[]) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $f$ SELECT public.search_fold(pg_catalog.array_to_string($1, ' ')) $f$;
