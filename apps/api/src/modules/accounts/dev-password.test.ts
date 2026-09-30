import { DEV_PASSWORD, DEV_PASSWORD_HASH } from '@reprint/db'
import { expect, it } from 'vitest'
import { verifyPassword } from '../auth/password.js'

it('the seeded dev hash is a valid hash of the documented dev password', async () => {
  expect(await verifyPassword(DEV_PASSWORD_HASH, DEV_PASSWORD)).toBe(true)
  expect(await verifyPassword(DEV_PASSWORD_HASH, 'something else entirely')).toBe(false)
})
