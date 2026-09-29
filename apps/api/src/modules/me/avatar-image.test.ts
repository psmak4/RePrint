import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { InvalidImageError, processAvatar } from './avatar-image.js'

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer()
}

describe('processAvatar', () => {
  it('re-encodes any accepted image as a 256 px square WebP', async () => {
    const result = await processAvatar(await png(600, 300))
    const meta = await sharp(result.data).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 })
    expect(result).toMatchObject({ width: 256, height: 256 })
  })

  it('strips EXIF data', async () => {
    const withExif = await sharp(await png(300, 300))
      .jpeg()
      .withExif({ IFD0: { Copyright: 'someone', ImageDescription: 'home address' } })
      .toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()

    const result = await processAvatar(withExif)
    expect((await sharp(result.data).metadata()).exif).toBeUndefined()
  })

  it('rejects text and other non-image bytes', async () => {
    await expect(processAvatar(Buffer.from('just some text'))).rejects.toBeInstanceOf(
      InvalidImageError,
    )
  })

  it('rejects image formats it does not accept', async () => {
    const tiff = await sharp(await png(20, 20))
      .tiff()
      .toBuffer()
    await expect(processAvatar(tiff)).rejects.toThrow(/JPEG, PNG, WebP, or GIF/)
  })

  it('rejects a truncated image', async () => {
    const whole = await png(400, 400)
    await expect(processAvatar(whole.subarray(0, 40))).rejects.toBeInstanceOf(InvalidImageError)
  })
})
