import { describe, expect, it } from 'vitest'
import { problemDetailsSchema } from './problem-details.js'

const valid = { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Invalid input' }

describe('problemDetailsSchema', () => {
  it('accepts a body without errors', () => {
    expect(problemDetailsSchema.parse(valid)).toEqual(valid)
  })

  it('accepts errors with path and message', () => {
    const body = { ...valid, errors: [{ path: 'body.rating', message: 'Required' }] }
    expect(problemDetailsSchema.parse(body)).toEqual(body)
  })

  it('rejects a non-error status', () => {
    expect(problemDetailsSchema.safeParse({ ...valid, status: 200 }).success).toBe(false)
  })

  it('rejects a body missing detail', () => {
    const { detail: _detail, ...rest } = valid
    expect(problemDetailsSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects malformed error entries', () => {
    expect(problemDetailsSchema.safeParse({ ...valid, errors: [{ path: 'x' }] }).success).toBe(
      false,
    )
  })
})
