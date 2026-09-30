import { describe, expect, it } from 'vitest'
import { isLocked, planFieldUpdate } from './fields.js'

const now = new Date('2026-09-30T12:00:00.000Z')
const stamp = { source: 'stub', at: now.toISOString() }

describe('planFieldUpdate', () => {
  it('writes new values and stamps their origin', () => {
    const plan = planFieldUpdate({
      source: 'stub',
      now,
      current: { title: 'Old' },
      origins: {},
      incoming: [{ field: 'title', column: 'title', value: 'New' }],
    })
    expect(plan.set).toEqual({ title: 'New' })
    expect(plan.origins).toEqual({ title: stamp })
  })

  it('never overwrites a field named in lockedFields or set by an admin', () => {
    const plan = planFieldUpdate({
      source: 'stub',
      now,
      current: { title: 'Mine', subtitle: 'Also mine' },
      origins: { subtitle: { source: 'admin', at: '2026-01-01T00:00:00.000Z' } },
      lockedFields: ['title'],
      incoming: [
        { field: 'title', column: 'title', value: 'Theirs' },
        { field: 'subtitle', column: 'subtitle', value: 'Theirs too' },
      ],
    })
    expect(plan.set).toEqual({})
    expect(plan.origins.subtitle?.source).toBe('admin')
    expect(plan.origins.title).toBeUndefined()
  })

  it('does not erase a stored value with an empty one', () => {
    const plan = planFieldUpdate({
      source: 'stub',
      now,
      current: { description: 'Kept', format: 'paperback', alternateNames: ['A'] },
      origins: {},
      incoming: [
        { field: 'description', column: 'description', value: null },
        { field: 'format', column: 'format', value: 'unknown' },
        { field: 'alternateNames', column: 'alternateNames', value: [] },
      ],
    })
    expect(plan.set).toEqual({})
    expect(plan.origins).toEqual({})
  })

  it('keeps the earlier origin when the value has not changed', () => {
    const earlier = { source: 'other', at: '2026-01-01T00:00:00.000Z' }
    const plan = planFieldUpdate({
      source: 'stub',
      now,
      current: { title: 'Same' },
      origins: { title: earlier },
      incoming: [{ field: 'title', column: 'title', value: 'Same' }],
    })
    expect(plan.set).toEqual({})
    expect(plan.origins.title).toEqual(earlier)
  })
})

describe('isLocked', () => {
  it('is true for a listed field or an admin origin', () => {
    expect(isLocked('title', ['title'], {})).toBe(true)
    expect(isLocked('title', [], { title: { source: 'admin', at: 'x' } })).toBe(true)
    expect(isLocked('title', [], { title: { source: 'stub', at: 'x' } })).toBe(false)
  })
})

describe('planFieldUpdate with Source priorities', () => {
  const priorities: Record<string, Record<string, number>> = {
    first: { description: 1 },
    second: { description: 2, title: 2 },
  }
  const priorityOf = (source: string, field: string) => priorities[source]?.[field]
  const origins = { description: { source: 'first', at: '2026-01-01T00:00:00.000Z' } }
  const update = (source: string, value: string, extra: Partial<{ current: string }> = {}) =>
    planFieldUpdate({
      source,
      now,
      current: { description: extra.current ?? 'From first' },
      origins,
      incoming: [{ field: 'description', column: 'description', value }],
      priorityOf,
    })

  it('does not let a lower-priority Source replace a higher-priority value', () => {
    const plan = update('second', 'From second')
    expect(plan.set).toEqual({})
    expect(plan.origins).toEqual(origins)
  })

  it('lets a higher-priority Source replace a lower-priority value', () => {
    const plan = planFieldUpdate({
      source: 'first',
      now,
      current: { description: 'From second' },
      origins: { description: { source: 'second', at: '2026-01-01T00:00:00.000Z' } },
      incoming: [{ field: 'description', column: 'description', value: 'From first' }],
      priorityOf,
    })
    expect(plan.set).toEqual({ description: 'From first' })
    expect(plan.origins.description?.source).toBe('first')
  })

  it('lets the same Source refresh its own value', () => {
    expect(update('first', 'Newer').set).toEqual({ description: 'Newer' })
  })

  it('lets a lower-priority Source fill a field that is empty', () => {
    expect(update('second', 'Fallback', { current: '' }).set).toEqual({ description: 'Fallback' })
  })

  it('never lets a Source that is not trusted for the field replace a value', () => {
    const plan = planFieldUpdate({
      source: 'second',
      now,
      current: { subtitle: 'Kept' },
      origins: { subtitle: { source: 'first', at: '2026-01-01T00:00:00.000Z' } },
      incoming: [{ field: 'subtitle', column: 'subtitle', value: 'Untrusted' }],
      priorityOf,
    })
    expect(plan.set).toEqual({})
  })

  it('keeps an admin value against any Source', () => {
    const plan = planFieldUpdate({
      source: 'first',
      now,
      current: { description: 'Admin text' },
      origins: { description: { source: 'admin', at: '2026-01-01T00:00:00.000Z' } },
      incoming: [{ field: 'description', column: 'description', value: 'From first' }],
      priorityOf,
    })
    expect(plan.set).toEqual({})
  })
})
