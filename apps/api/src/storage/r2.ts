import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { assertSafeKey, type ImageStorage } from './types.js'

export interface R2Settings {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  baseUrl: string
}

/** Cloudflare R2 through its S3 API; browsers read through the CDN at `baseUrl`. */
export class R2ImageStorage implements ImageStorage {
  private readonly baseUrl: string

  constructor(
    private readonly settings: R2Settings,
    private readonly client: Pick<S3Client, 'send'> = new S3Client({
      region: 'auto',
      endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    }),
  ) {
    this.baseUrl = settings.baseUrl.replace(/\/$/, '')
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key)
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are unique per upload, so a stored object never changes.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }))
  }

  url(key: string): string {
    assertSafeKey(key)
    return `${this.baseUrl}/${key}`
  }
}
