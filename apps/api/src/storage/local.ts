import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { assertSafeKey, type ImageStorage } from './types.js'

/** Writes to a directory on disk; the API serves the files at `/v1/uploads/*` (dev and tests). */
export class LocalImageStorage implements ImageStorage {
  private readonly root: string
  private readonly baseUrl: string

  constructor(directory: string, baseUrl: string) {
    this.root = resolve(directory)
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private pathFor(key: string): string {
    assertSafeKey(key)
    return resolve(this.root, key)
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true })
  }

  url(key: string): string {
    assertSafeKey(key)
    return `${this.baseUrl}/${key}`
  }

  /** The stored bytes, or null when the object does not exist. */
  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }
}
