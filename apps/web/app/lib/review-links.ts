import { BOOK_REVIEWS_PAGE_SIZE, type ReviewSort } from '@reprint/shared'

export type ReviewListQuery = { sort: ReviewSort; rating?: number | undefined; page: number }

/** A Book page URL for one view of its review list. Defaults are left out so URLs stay short. */
export function reviewsHref(
  slug: string,
  query: ReviewListQuery,
  change: Partial<ReviewListQuery> = {},
): string {
  const next = { ...query, ...change }
  const params = new URLSearchParams()
  if (next.sort !== 'most_helpful') params.set('sort', next.sort)
  if (next.rating) params.set('rating', String(next.rating))
  if (next.page > 1) params.set('page', String(next.page))
  const search = params.toString()
  return `/books/${slug}${search ? `?${search}` : ''}#reviews`
}

export const REVIEWS_PAGE_SIZE = BOOK_REVIEWS_PAGE_SIZE
