// Values pages use in the browser, kept apart from the schemas that use them, so a page that
// needs a list of sorts or a length limit does not take Zod with it (M10-T14). The schema
// modules import them from here.

// Reviews (PRD §7.4, §7.6, §7.9).
export const REVIEW_RATING_MIN = 1
export const REVIEW_RATING_MAX = 5
export const REVIEW_HEADLINE_MAX = 120
export const REVIEW_BODY_MIN = 50
export const REVIEW_BODY_MAX = 10_000
/** Reviews on a Book page: 10 per page (PRD §7.4). */
export const BOOK_REVIEWS_PAGE_SIZE = 10
export const REVIEW_SORTS = ['most_helpful', 'newest', 'highest', 'lowest'] as const
/** Why a Member reports a Review (PRD §7.9). */
export const REVIEW_REPORT_REASONS = [
  'unmarked_spoiler',
  'offensive',
  'spam',
  'off_topic',
  'other',
] as const
export const REPORT_NOTE_MAX = 500

// Genres, Series, and search (PRD §7.3, §7.5).
export const GENRE_SORTS = ['top_rated', 'most_reviewed', 'newest_review'] as const
/** How many Books a Book page's Series card shows, around the current Book (D-199). */
export const SERIES_WINDOW = 8
export const SEARCH_SORTS = ['relevance', 'most_reviewed', 'highest_rated', 'newest'] as const
