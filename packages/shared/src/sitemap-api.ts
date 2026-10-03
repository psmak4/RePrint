import { z } from 'zod'

/** A sitemap holds at most this many URLs (sitemaps.org protocol). */
export const SITEMAP_MAX_URLS = 50_000

/** One public page: a path on the site (never a full URL) and when its content last changed. */
export const sitemapUrlSchema = z.object({
  path: z.string().startsWith('/'),
  lastModified: z.iso.datetime().nullable(),
})
export type SitemapUrl = z.infer<typeof sitemapUrlSchema>

/** The nightly build's chunk list; chunk numbers start at 1. */
export const sitemapIndexSchema = z.object({
  builtAt: z.iso.datetime(),
  chunks: z.array(
    z.object({
      number: z.number().int().min(1),
      urlCount: z.number().int().min(1).max(SITEMAP_MAX_URLS),
      lastModified: z.iso.datetime().nullable(),
    }),
  ),
})
export type SitemapIndex = z.infer<typeof sitemapIndexSchema>

export const sitemapChunkSchema = z.object({
  urls: z.array(sitemapUrlSchema).max(SITEMAP_MAX_URLS),
})
export type SitemapChunk = z.infer<typeof sitemapChunkSchema>

export const sitemapChunkParamsSchema = z.object({ number: z.coerce.number().int().min(1) })
