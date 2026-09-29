import type { Env } from '../config/env.js'
import { LocalImageStorage } from './local.js'
import { R2ImageStorage } from './r2.js'
import type { ImageStorage } from './types.js'

export { LocalImageStorage } from './local.js'
export { R2ImageStorage } from './r2.js'
export type { ImageStorage } from './types.js'

/** Picks the driver from `STORAGE_DRIVER`; the env schema guarantees the R2 settings exist. */
export function createImageStorage(env: Env): ImageStorage {
  if (env.STORAGE_DRIVER === 'r2') {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_UPLOADS } = env
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_UPLOADS) {
      throw new Error('STORAGE_DRIVER=r2 needs the R2_* settings')
    }
    return new R2ImageStorage({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET_UPLOADS,
      baseUrl: env.IMAGE_BASE_URL,
    })
  }
  return new LocalImageStorage(env.STORAGE_LOCAL_DIR, env.IMAGE_BASE_URL)
}
