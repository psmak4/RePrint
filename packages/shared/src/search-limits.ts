// Search limits used in the browser too, kept apart from the schemas so importing them does not
// bring Zod into a page's JavaScript (M10-T07).

/** Longest query the search box accepts. */
export const SEARCH_QUERY_MAX_LENGTH = 100
/** Suggestions and search start at this many characters (PRD §7.3). */
export const SEARCH_MIN_LENGTH = 2
