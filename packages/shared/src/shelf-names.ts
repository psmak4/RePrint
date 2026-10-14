// The Shelf names, apart from their schemas, so a page that needs only the names does not take
// Zod with them (M10-T14).

/** The three Shelves (PRD §5.3, §7.7). A Book is on at most one per Member. */
export const SHELVES = ['want_to_read', 'reading', 'read'] as const
export type Shelf = (typeof SHELVES)[number]
