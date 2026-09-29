import { AVATAR_SIZE } from '@reprint/shared'
import sharp from 'sharp'

/** The uploaded bytes are not an image we accept. */
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidImageError'
  }
}

// The kind of file is decided by what sharp finds in the bytes, never by the name or MIME type sent.
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif'])
// Refuses decompression bombs: a small file that expands to a huge bitmap.
const MAX_INPUT_PIXELS = 40_000_000

/** Re-encodes an upload as a square WebP avatar. sharp drops EXIF and other metadata unless asked to keep it. */
export async function processAvatar(
  input: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    const { format } = await image.metadata()
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      throw new InvalidImageError('Upload a JPEG, PNG, WebP, or GIF image.')
    }
    const { data, info } = await image
      .rotate() // applies the EXIF orientation before the tag is dropped
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  } catch (error) {
    if (error instanceof InvalidImageError) throw error
    throw new InvalidImageError('That file could not be read as an image.')
  }
}
