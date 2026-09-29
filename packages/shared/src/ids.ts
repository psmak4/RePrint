import { z } from 'zod'

/** Every RePrint ID is a UUIDv7 (version nibble 7, RFC 9562 variant). */
export const idSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Must be a UUIDv7',
  )

export type Id = z.infer<typeof idSchema>
