/**
 * Render the production path end to end: real SegFormer mask, real recolour.
 *
 * `preview-recolour.ts` approximates the wall by colour distance, which on a
 * room with sunlit and shadowed wall of the same hue as the curtains misses
 * most of the wall and grabs bedding instead. Any mean luma measured through it
 * describes the clutter, so conclusions drawn from it are not about the wall.
 */
import { AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers'
import sharp from 'sharp'
import { hexToRgb } from '../src/lib/colour'
import { featherMask, recolour, thresholdConfidence } from '../src/lib/mask'
import { applyWhiteBalance, greyPointGains } from '../src/lib/whiteBalance'

// `recolour` constructs an ImageData; Node has no DOM, so stand one in.
class NodeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
    readonly colorSpace = 'srgb' as PredefinedColorSpace,
  ) {}
}
;(globalThis as { ImageData?: unknown }).ImageData ??= NodeImageData

const MODEL_ID = 'Xenova/segformer-b0-finetuned-ade-512-512'
const WALL_CLASS = 0

const SOURCE = process.argv[2]
const TARGET = process.argv[3] ?? '#313c3e'
const OUT_DIR = process.argv[4] ?? '.'
const SENSITIVITY = Number(process.argv[5] ?? 50)
// Fractional x,y of the grey point to sample; omit to skip white balance.
const GREY = process.argv[6] ? process.argv[6].split(',').map(Number) : null

const run = async () => {
  console.log(`Loading ${SOURCE}`)
  const { data, info } = await sharp(SOURCE).resize(1200).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = info
  console.log(`  ${width}x${height}`)

  // App.tsx segments the white-balanced image, so correct before inference.
  let src = { data: new Uint8ClampedArray(data), width, height, colorSpace: 'srgb' } as ImageData
  if (GREY) {
    const [fx, fy] = GREY
    const gi = (Math.round(fy * height) * width + Math.round(fx * width)) * 4
    const gains = greyPointGains(src.data[gi], src.data[gi + 1], src.data[gi + 2])
    console.log(`  grey point gains ${gains.map((g) => g.toFixed(2)).join(', ')}`)
    src = applyWhiteBalance(src, { temp: 0, tint: 0, gains })
  }

  console.log('Loading SegFormer (first run downloads ~15 MB)…')
  const [model, processor] = await Promise.all([
    AutoModel.from_pretrained(MODEL_ID, { dtype: 'q8' }),
    AutoProcessor.from_pretrained(MODEL_ID),
  ])

  console.log('Running inference…')
  const image = new RawImage(new Uint8ClampedArray(src.data), width, height, 4)
  const { logits } = await model(await processor(image))
  const [, classes, lh, lw] = logits.dims as number[]
  const ld = logits.data as Float32Array
  const plane = lh * lw
  const small = new Uint8Array(plane)
  for (let p = 0; p < plane; p++) {
    let max = ld[p]
    for (let c = 1; c < classes; c++) if (ld[c * plane + p] > max) max = ld[c * plane + p]
    let sum = 0
    for (let c = 0; c < classes; c++) sum += Math.exp(ld[c * plane + p] - max)
    small[p] = Math.round((Math.exp(ld[WALL_CLASS * plane + p] - max) / sum) * 255)
  }

  const confidence = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const fy = Math.min(lh - 1, ((y + 0.5) * lh) / height - 0.5)
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(lh - 1, y0 + 1), wy = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = Math.min(lw - 1, ((x + 0.5) * lw) / width - 0.5)
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(lw - 1, x0 + 1), wx = fx - x0
      const top = small[y0 * lw + x0] * (1 - wx) + small[y0 * lw + x1] * wx
      const bot = small[y1 * lw + x0] * (1 - wx) + small[y1 * lw + x1] * wx
      confidence[y * width + x] = top * (1 - wy) + bot * wy
    }
  }

  const mask = featherMask(
    thresholdConfidence(confidence, Math.round((100 - SENSITIVITY) * 2.55)),
    width, height, 2,
  )
  let covered = 0
  for (let p = 0; p < mask.length; p++) if (mask[p] > 0) covered++
  console.log(`  mask covers ${(covered / mask.length * 100).toFixed(1)}%`)

  const out = recolour(src, mask, hexToRgb(TARGET), 0.55)

  const overlay = Buffer.from(src.data)
  for (let p = 0; p < mask.length; p++) {
    if (mask[p] === 0) continue
    const i = p * 4
    overlay[i] = 255; overlay[i + 1] = 0; overlay[i + 2] = 0
  }
  await sharp(overlay, { raw: { width, height, channels: 4 } }).png().toFile(`${OUT_DIR}/seg-mask.png`)
  await sharp(Buffer.from(out.data), { raw: { width, height, channels: 4 } }).png()
    .toFile(`${OUT_DIR}/seg-recolour-${TARGET.slice(1)}.png`)
  console.log(`  wrote seg-mask.png and seg-recolour-${TARGET.slice(1)}.png`)
}
run()
