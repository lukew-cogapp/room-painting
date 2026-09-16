export type WhiteBalance = { temp: number; tint: number; gains: [number, number, number] }

export const NEUTRAL_WB: WhiteBalance = { temp: 0, tint: 0, gains: [1, 1, 1] }

/**
 * Per-channel gains that would drag the sampled pixel to neutral grey.
 *
 * Normalised against green because the temp/tint sliders below also pivot on
 * green, so the two controls compose without fighting over overall exposure.
 */
export const greyPointGains = (r: number, g: number, b: number): [number, number, number] => {
  const safe = (v: number) => (v < 1 ? 1 : v)
  return [g / safe(r), 1, g / safe(b)]
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
