import type { FieldOrigins } from '@reprint/shared'
import type { PriorityLookup } from '../enrichment/priorities.js'

/** The origin name for a field a person set; such a field is locked (PRD §5.2). */
export const ADMIN_ORIGIN = 'admin'

/** One field a Source supplies: its origin name, the column it lands in, and the incoming value. */
export interface IncomingField {
  field: string
  column: string
  value: unknown
}

export interface FieldUpdate {
  /** Column values to write; empty when nothing changed. */
  set: Record<string, unknown>
  /** The record's field origins after the update. */
  origins: FieldOrigins
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (value === 'unknown') return true // an Edition Format the Source could not tell
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** A field is locked when an admin listed it or was the last to set it. */
export function isLocked(field: string, lockedFields: readonly string[], origins: FieldOrigins) {
  return lockedFields.includes(field) || origins[field]?.source === ADMIN_ORIGIN
}

/**
 * True when `source` may replace what `previous` wrote (PRD §6): a lower priority number wins, a tie
 * goes to the newer write, and a Source that is not trusted for the field never replaces a value.
 */
function outranks(priorityOf: PriorityLookup, field: string, source: string, previous: string) {
  const mine = priorityOf(source, field)
  if (mine === undefined) return false
  const theirs = priorityOf(previous, field)
  return theirs === undefined || mine <= theirs
}

/**
 * Decides which incoming Source fields to write onto an existing record. A locked field is never
 * touched, an empty incoming value never erases a stored one, and an unchanged value keeps its origin.
 * Fields written are stamped with the Source and time. `current` is keyed by column. With `priorityOf`,
 * a value another Source wrote is replaced only by a Source with an equal or better priority for that
 * field; an empty stored value is always filled.
 */
export function planFieldUpdate(options: {
  source: string
  now: Date
  current: Record<string, unknown>
  origins: FieldOrigins
  lockedFields?: readonly string[]
  incoming: readonly IncomingField[]
  priorityOf?: PriorityLookup
}): FieldUpdate {
  const { source, now, current, origins, incoming, priorityOf } = options
  const lockedFields = options.lockedFields ?? []
  const set: Record<string, unknown> = {}
  const nextOrigins: FieldOrigins = { ...origins }
  for (const { field, column, value } of incoming) {
    if (isEmpty(value) || isLocked(field, lockedFields, origins)) continue
    const previous = origins[field]?.source
    if (
      priorityOf &&
      previous &&
      previous !== source &&
      !isEmpty(current[column]) &&
      !outranks(priorityOf, field, source, previous)
    ) {
      continue
    }
    if (same(current[column], value) && origins[field]) continue
    if (!same(current[column], value)) set[column] = value
    nextOrigins[field] = { source, at: now.toISOString() }
  }
  return { set, origins: nextOrigins }
}
