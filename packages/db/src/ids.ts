import { v7 as uuidv7 } from 'uuid'

/** A new UUIDv7 (D-021: generated in the app, not by Postgres). */
export function newId(): string {
  return uuidv7()
}
