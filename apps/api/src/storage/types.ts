/** Where uploaded images live (D-030). Keys look like `avatars/<id>.webp`. */
export interface ImageStorage {
  /** Stores `body` under `key`, replacing any existing object. */
  put: (key: string, body: Buffer, contentType: string) => Promise<void>
  /** Removes the object; a missing object is not an error. */
  remove: (key: string) => Promise<void>
  /** The public URL browsers load the object from. */
  url: (key: string) => string
}

const SAFE_KEY = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[a-z0-9]+$/

/** Keys are made by the app, but a check keeps `..` and absolute paths out of any driver. */
export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new Error(`unsafe storage key: ${key}`)
}
