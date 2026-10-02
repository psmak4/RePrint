import { BOOK_COVER_MAX_WIDTH } from '@reprint/shared'
import sharp from 'sharp'
import { InvalidImageError } from '../me/avatar-image.js'

// The kind of file is decided by what sharp finds in the bytes, never by the name or MIME type sent.
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif'])
// Refuses decompression bombs: a small file that expands to a huge bitmap.
const MAX_INPUT_PIXELS = 40_000_000

/** Re-encodes an upload as a WebP Book cover, at most `BOOK_COVER_MAX_WIDTH` wide, with no metadata. */
export async function processBookCover(
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
      .resize({ width: BOOK_COVER_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  } catch (error) {
    if (error instanceof InvalidImageError) throw error
    throw new InvalidImageError('That file could not be read as an image.')
  }
}
