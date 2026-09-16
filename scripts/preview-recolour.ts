/**
 * Render the real recolour path to PNGs so the result can be judged by eye.
 *
 * The wall is approximated by colour distance rather than the segmentation
 * model, which is close enough to compare desaturation settings.
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { hexToRgb, luma, shadePixel } from '../src/lib/colour'

const SOURCE = process.argv[2]
const TARGET = process.argv[3] ?? '#29a3d9'
const OUT_DIR = process.argv[4] ?? '.'

const run = async () => {
  console.log(`Loading ${SOURCE}`)
  const { data, info } = await sharp(SOURCE)
    .resize(1200)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  console.log(`  ${width}x${height}, ${channels} channels`)

  // The wall in this photo is a desaturated blue-grey; match on hue and
  // moderate saturation so furniture and ceiling are left alone.
  const isWall = (r: number, g: number, b: number) => {
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const sat = mx === 0 ? 0 : (mx - mn) / mx
    return b > r && b >= g && sat > 0.12 && sat < 0.55 && mx > 40 && mx < 200
  }

  const target = hexToRgb(TARGET)
  const targetLuma = luma(target.r, target.g, target.b)

  for (const desat of [0, 0.35, 0.55, 0.75]) {
    const out = Buffer.from(data)
    let painted = 0
    for (let p = 0; p < width * height; p++) {
      const i = p * channels
      if (!isWall(data[i], data[i + 1], data[i + 2])) continue
      painted++
      const s = shadePixel(luma(data[i], data[i + 1], data[i + 2]), target, targetLuma, desat)
      out[i] = s.r
      out[i + 1] = s.g
      out[i + 2] = s.b
    }
    const file = `${OUT_DIR}/recolour-${Math.round(desat * 100)}.png`
    await sharp(out, { raw: { width, height, channels } }).png().toFile(file)
    console.log(`  desat ${desat}: ${((painted / (width * height)) * 100).toFixed(1)}% painted -> ${file}`)
  }
  writeFileSync(`${OUT_DIR}/.done`, 'ok')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
