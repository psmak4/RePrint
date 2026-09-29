import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../config/env.js'
import { createImageStorage, LocalImageStorage, R2ImageStorage } from './index.js'

const BASE = 'http://img.test/v1/uploads/'

describe('LocalImageStorage', () => {
  let directory: string
  let storage: LocalImageStorage

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'reprint-storage-'))
    storage = new LocalImageStorage(directory, BASE)
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('stores, reads, and removes an object', async () => {
    await storage.put('avatars/one.webp', Buffer.from('bytes'))
    expect((await storage.read('avatars/one.webp'))?.toString()).toBe('bytes')
    await storage.remove('avatars/one.webp')
    expect(await storage.read('avatars/one.webp')).toBeNull()
    await expect(storage.remove('avatars/one.webp')).resolves.toBeUndefined()
  })

  it('builds public URLs from the base URL', () => {
    expect(storage.url('avatars/one.webp')).toBe('http://img.test/v1/uploads/avatars/one.webp')
  })

  it.each(['../secret.webp', '/etc/passwd.webp', 'avatars/../../x.webp', 'a b.webp', 'noext'])(
    'refuses the unsafe key %s',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(/unsafe storage key/)
      await expect(storage.read(key)).rejects.toThrow(/unsafe storage key/)
      expect(() => storage.url(key)).toThrow(/unsafe storage key/)
    },
  )
})

describe('R2ImageStorage', () => {
  const settings = {
    accountId: 'acct',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    bucket: 'uploads',
    baseUrl: 'https://img.reprint.test/',
  }

  it('puts and deletes objects in the bucket through the S3 API', async () => {
    const send = vi.fn().mockResolvedValue({})
    const storage = new R2ImageStorage(settings, { send })
    await storage.put('avatars/one.webp', Buffer.from('bytes'), 'image/webp')
    await storage.remove('avatars/one.webp')

    const [put, remove] = send.mock.calls.map(([command]) => command)
    expect(put).toBeInstanceOf(PutObjectCommand)
    expect(put.input).toMatchObject({
      Bucket: 'uploads',
      Key: 'avatars/one.webp',
      ContentType: 'image/webp',
    })
    expect(remove).toBeInstanceOf(DeleteObjectCommand)
    expect(remove.input).toEqual({ Bucket: 'uploads', Key: 'avatars/one.webp' })
    expect(storage.url('avatars/one.webp')).toBe('https://img.reprint.test/avatars/one.webp')
  })

  it('refuses unsafe keys before calling R2', async () => {
    const send = vi.fn()
    const storage = new R2ImageStorage(settings, { send })
    await expect(storage.put('../x.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
})

describe('createImageStorage', () => {
  const source = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGINS: 'http://a.test',
  }

  it('uses local disk by default and R2 when configured', () => {
    expect(createImageStorage(loadEnv(source))).toBeInstanceOf(LocalImageStorage)
    const r2 = loadEnv({
      ...source,
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET_UPLOADS: 'uploads',
      IMAGE_BASE_URL: 'https://img.reprint.test',
    })
    expect(createImageStorage(r2)).toBeInstanceOf(R2ImageStorage)
  })
})
