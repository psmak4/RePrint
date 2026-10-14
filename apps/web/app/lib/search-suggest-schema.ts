// Loaded on the first suggestion request only, so Zod stays out of every page's root bundle
// (M10-T07; see `fetchSuggestions`).
export { searchSuggestResponseSchema } from '@reprint/shared'
