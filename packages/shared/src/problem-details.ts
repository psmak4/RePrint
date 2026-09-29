import { z } from 'zod'

export const problemDetailsErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
})

/** RFC 9457 Problem Details, the only error body the API sends. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  errors: z.array(problemDetailsErrorSchema).optional(),
})

export type ProblemDetailsError = z.infer<typeof problemDetailsErrorSchema>
export type ProblemDetails = z.infer<typeof problemDetailsSchema>
