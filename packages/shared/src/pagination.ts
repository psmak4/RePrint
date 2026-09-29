import { z } from 'zod'

export const MAX_PAGE_SIZE = 50
export const DEFAULT_PAGE_SIZE = 20

/** Public lists: `?page=&pageSize=`. Query strings arrive as text, so numbers are coerced. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export type PageQuery = z.infer<typeof pageQuerySchema>

export const pageMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
})

export type PageMeta = z.infer<typeof pageMetaSchema>

export function buildPageMeta(query: PageQuery, total: number): PageMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  }
}

/** Admin queues: `?cursor=`. The cursor is opaque to clients. */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export type CursorQuery = z.infer<typeof cursorQuerySchema>

export const cursorMetaSchema = z.object({
  nextCursor: z.string().nullable(),
})

export type CursorMeta = z.infer<typeof cursorMetaSchema>

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), meta: pageMetaSchema })
}

export function cursorPageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), meta: cursorMetaSchema })
}
