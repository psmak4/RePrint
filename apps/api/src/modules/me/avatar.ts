import multipart from '@fastify/multipart'
import { covers, newId, users } from '@reprint/db'
import { uploadAvatarResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import type { ImageStorage } from '../../storage/index.js'
import { requireAuth } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { InvalidImageError, processAvatar } from './avatar-image.js'

export interface AvatarRoutesOptions extends AuthRoutesOptions {
  storage: ImageStorage
}

const fileProblem = (detail: string) =>
  new HttpProblem(400, detail, { errors: [{ path: 'body.file', message: detail }] })

export const avatarRoutes: FastifyPluginAsyncZod<AvatarRoutesOptions> = async (app, options) => {
  const { env, db, storage } = options
  await app.register(multipart, { limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fields: 0 } })

  app.post(
    '/me/avatar',
    { preHandler: [requireAuth], schema: { response: { 200: uploadAvatarResponseSchema } } },
    async (request) => {
      if (!db || !request.auth) throw new Error('avatar route needs a database')
      if (!request.isMultipart()) throw fileProblem('Send the image as multipart form data.')

      const part = await request.file()
      if (!part) throw fileProblem('Choose an image to upload.')
      // Over the size limit, this throws a 413 that the error handler turns into Problem Details.
      const upload = await part.toBuffer()

      let image: Awaited<ReturnType<typeof processAvatar>>
      try {
        image = await processAvatar(upload)
      } catch (error) {
        if (error instanceof InvalidImageError) throw fileProblem(error.message)
        throw error
      }

      const coverId = newId()
      const key = `avatars/${coverId}.webp`
      await storage.put(key, image.data, 'image/webp')

      let previousKey: string | null = null
      try {
        previousKey = await db.transaction(async (tx) => {
          const [current] = await tx
            .select({ coverId: covers.id, key: covers.r2Key })
            .from(users)
            .leftJoin(covers, eq(covers.id, users.avatarId))
            .where(eq(users.id, request.auth?.user.id ?? ''))
            .for('update', { of: users })
          await tx.insert(covers).values({
            id: coverId,
            origin: 'upload',
            r2Key: key,
            width: image.width,
            height: image.height,
          })
          await tx
            .update(users)
            .set({ avatarId: coverId })
            .where(eq(users.id, request.auth?.user.id ?? ''))
          if (current?.coverId) await tx.delete(covers).where(eq(covers.id, current.coverId))
          return current?.key ?? null
        })
      } catch (error) {
        await storage.remove(key).catch(() => {})
        throw error
      }

      // The old file is unreachable now; a failed delete only leaves an orphan behind.
      if (previousKey) {
        await storage.remove(previousKey).catch((error) => {
          request.log.warn({ err: error, key: previousKey }, 'could not remove the previous avatar')
        })
      }
      return { avatarUrl: storage.url(key) }
    },
  )
}
