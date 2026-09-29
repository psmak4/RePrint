import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { covers, users } from '@reprint/db'
import { meSchema, problemDetailsSchema, uploadAvatarResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { LocalImageStorage } from '../../storage/index.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const IMAGE_BASE = 'http://img.reprint.test/v1/uploads'
const MAX_BYTES = 200_000

let stack: TestStack
let app: FastifyInstance
let uploadDir: string

beforeAll(async () => {
  stack = await startTestStack()
  uploadDir = await mkdtemp(join(tmpdir(), 'reprint-avatars-'))
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    IMAGE_BASE_URL: IMAGE_BASE,
    UPLOAD_MAX_BYTES: String(MAX_BYTES),
  })
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    storage: new LocalImageStorage(uploadDir, IMAGE_BASE),
  })
  app.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await app.sessions.start(request, reply, userId)
    return { ok: true }
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stack?.stop()
  await rm(uploadDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await stack.reset()
  await rm(uploadDir, { recursive: true, force: true })
})

async function signIn(userId: string) {
  const started = await app.inject({ method: 'GET', url: `/test/start/${userId}` })
  return started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? ''
}

function multipartBody(file: Buffer, filename: string, contentType: string, field = 'file') {
  const boundary = '----reprint-test-boundary'
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, file, tail]),
    'content-type': `multipart/form-data; boundary=${boundary}`,
  }
}

async function upload(
  token: string | null,
  file: Buffer,
  filename = 'me.png',
  contentType = 'image/png',
) {
  const { payload, 'content-type': type } = multipartBody(file, filename, contentType)
  return app.inject({
    method: 'POST',
    url: '/v1/me/avatar',
    headers: { origin: ORIGIN, 'content-type': type },
    cookies: token ? { [SESSION_COOKIE]: token } : {},
    payload,
  })
}

const solidPng = (width = 640, height = 480) =>
  sharp({ create: { width, height, channels: 3, background: { r: 20, g: 90, b: 200 } } })
    .png()
    .toBuffer()

describe('POST /v1/me/avatar', () => {
  it('stores a 256 px WebP with no EXIF and records it as an upload cover', async () => {
    const user = await createTestUser(stack.db.db)
    const token = await signIn(user.id)
    const withExif = await sharp(await solidPng())
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret location' } })
      .toBuffer()

    const response = await upload(token, withExif, 'me.jpg', 'image/jpeg')

    expect(response.statusCode).toBe(200)
    const { avatarUrl } = uploadAvatarResponseSchema.parse(response.json())
    const [cover] = await stack.db.db.select().from(covers)
    expect(cover).toMatchObject({ origin: 'upload', width: 256, height: 256 })
    expect(avatarUrl).toBe(`${IMAGE_BASE}/${cover?.r2Key}`)
    const [owner] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(owner?.avatarId).toBe(cover?.id)

    const stored = await readFile(join(uploadDir, cover?.r2Key ?? ''))
    const meta = await sharp(stored).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 })
    expect(meta.exif).toBeUndefined()
  })

  it('accepts a PNG by its content even when it is named .txt', async () => {
    const user = await createTestUser(stack.db.db)
    const response = await upload(await signIn(user.id), await solidPng(), 'me.txt', 'text/plain')
    expect(response.statusCode).toBe(200)
  })

  it('rejects a text file named .png with a 400 on body.file', async () => {
    const user = await createTestUser(stack.db.db)
    const response = await upload(
      await signIn(user.id),
      Buffer.from('this is not an image'),
      'me.png',
      'image/png',
    )
    expect(response.statusCode).toBe(400)
    const body = problemDetailsSchema.parse(response.json())
    expect(body.errors?.[0]?.path).toBe('body.file')
    expect(await stack.db.db.select().from(covers)).toHaveLength(0)
  })

  it('rejects a file over the size cap with 413', async () => {
    const user = await createTestUser(stack.db.db)
    const response = await upload(await signIn(user.id), Buffer.alloc(MAX_BYTES + 1024, 1))
    expect(response.statusCode).toBe(413)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(413)
    expect(await stack.db.db.select().from(covers)).toHaveLength(0)
  })

  it('rejects a request that is not multipart, or has no file', async () => {
    const user = await createTestUser(stack.db.db)
    const token = await signIn(user.id)
    const json = await app.inject({
      method: 'POST',
      url: '/v1/me/avatar',
      headers: { origin: ORIGIN },
      cookies: { [SESSION_COOKIE]: token },
      payload: {},
    })
    expect(json.statusCode).toBe(400)

    const boundary = 'x'
    const empty = await app.inject({
      method: 'POST',
      url: '/v1/me/avatar',
      headers: { origin: ORIGIN, 'content-type': `multipart/form-data; boundary=${boundary}` },
      cookies: { [SESSION_COOKIE]: token },
      payload: `--${boundary}--\r\n`,
    })
    expect(empty.statusCode).toBe(400)
  })

  it('denies Visitors with 401', async () => {
    const response = await upload(null, await solidPng())
    expect(response.statusCode).toBe(401)
  })

  it('replaces the previous avatar and deletes its file and cover', async () => {
    const user = await createTestUser(stack.db.db)
    const token = await signIn(user.id)
    await upload(token, await solidPng())
    const [first] = await stack.db.db.select().from(covers)
    await upload(token, await solidPng(300, 300))

    const rows = await stack.db.db.select().from(covers)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).not.toBe(first?.id)
    expect(await readdir(join(uploadDir, 'avatars'))).toEqual([`${rows[0]?.id}.webp`])
  })

  it('shows the avatar URL on GET /v1/me, and null before an upload', async () => {
    const user = await createTestUser(stack.db.db)
    const token = await signIn(user.id)
    const read = async () =>
      meSchema.parse(
        (
          await app.inject({ method: 'GET', url: '/v1/me', cookies: { [SESSION_COOKIE]: token } })
        ).json(),
      )
    expect((await read()).avatarUrl).toBeNull()
    const { avatarUrl } = uploadAvatarResponseSchema.parse(
      (await upload(token, await solidPng())).json(),
    )
    expect((await read()).avatarUrl).toBe(avatarUrl)
  })
})

describe('GET /v1/uploads/*', () => {
  it('serves a stored avatar as an immutable, cross-origin-readable WebP', async () => {
    const user = await createTestUser(stack.db.db)
    const token = await signIn(user.id)
    const { avatarUrl } = uploadAvatarResponseSchema.parse(
      (await upload(token, await solidPng())).json(),
    )

    const response = await app.inject({ method: 'GET', url: new URL(avatarUrl).pathname })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/webp')
    expect(response.headers['cache-control']).toContain('immutable')
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect((await sharp(response.rawPayload).metadata()).width).toBe(256)
  })

  it('returns 404 for a missing image and for path traversal', async () => {
    for (const url of [
      '/v1/uploads/avatars/missing.webp',
      '/v1/uploads/../../etc/passwd',
      '/v1/uploads/avatars/%2e%2e%2fsecret.webp',
      '/v1/uploads/avatars/one.png',
    ]) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(404)
    }
  })
})
