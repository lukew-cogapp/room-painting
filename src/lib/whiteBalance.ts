export type WhiteBalance = { temp: number; tint: number; gains: [number, number, number] }

export const NEUTRAL_WB: WhiteBalance = { temp: 0, tint: 0, gains: [1, 1, 1] }

/**
 * The luma a sampled grey point is lifted to.
 *
 * Mid-grey rather than white: the pixel picked is a lit wall or a white surface
 * in shade, not a specular highlight, so pinning it to 255 would blow out
 * everything brighter than it.
 */
const GREY_TARGET = 168

/** Ceiling on the exposure lift, so an almost-black sample cannot blow the photo out. */
const MAX_LIFT = 2.2

/**
 * Per-channel gains that drag the sampled pixel to a neutral mid-grey.
 *
 * The ratios between the channels neutralise the light's colour; their overall
 * magnitude corrects exposure. A room shot against its own windows meters for
 * the glass, so correcting hue alone leaves the walls dim and the eyedropper
 * reporting the muddy values that really are in the file.
 */
export const greyPointGains = (r: number, g: number, b: number): [number, number, number] => {
  const safe = (v: number) => (v < 1 ? 1 : v)
  const lift = Math.min(MAX_LIFT, GREY_TARGET / safe(g))
  return [(g / safe(r)) * lift, lift, (g / safe(b)) * lift]
}

const TEMP_STRENGTH = 0.4
const TINT_STRENGTH = 0.3

export const combinedGains = (wb: WhiteBalance): [number, number, number] => {
  const t = wb.temp / 100
  const n = wb.tint / 100
  return [
    wb.gains[0] * (1 + t * TEMP_STRENGTH),
    wb.gains[1] * (1 + n * TINT_STRENGTH),
    wb.gains[2] * (1 - t * TEMP_STRENGTH),
  ]
}

export const applyWhiteBalance = (src: ImageData, wb: WhiteBalance): ImageData => {
  const [gr, gg, gb] = combinedGains(wb)
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
  const d = out.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * gr
    d[i + 1] = d[i + 1] * gg
    d[i + 2] = d[i + 2] * gb
  }
  return out
}
