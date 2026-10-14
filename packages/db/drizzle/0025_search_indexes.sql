DROP INDEX "authors_name_trgm_idx";--> statement-breakpoint
DROP INDEX "books_title_trgm_idx";--> statement-breakpoint
CREATE INDEX "authors_name_search_idx" ON "authors" USING gin (search_fold("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "authors_alternate_names_search_idx" ON "authors" USING gin (search_fold_names("alternate_names") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "books_title_search_idx" ON "books" USING gin (search_fold("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "series_name_search_idx" ON "series" USING gin (search_fold("name") gin_trgm_ops);