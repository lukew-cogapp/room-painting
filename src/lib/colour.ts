export type Rgb = { r: number; g: number; b: number }

export const hexToRgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`

/** Rec. 709 luma, the perceptual weighting the recolour relies on. */
export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/**
 * Repaint a pixel to `target` while keeping the source pixel's shading.
 *
 * Scaling the target by the source's luma alone crushes highlights to the
 * target colour and loses the sheen that makes paint read as paint, so light
 * pixels are pushed toward white by the same ratio instead.
 *
 * Both branches then desaturate as the pixel brightens. Multiplicative scaling
 * holds the target's channel ratios at every luma, which pins a vivid colour at
 * full saturation across the whole wall and reads as flat plastic; a real
 * surface washes out toward the light instead.
 */
export const DEFAULT_DESATURATION = 0.55

/**
 * How much of the photo's illumination range survives into the repaint.
 *
 * A room lit through two windows spans a 4-5x illumination ratio between
 * sunlit and shadowed wall. Carrying that through wholesale means a mid-tone
 * swatch still renders light where the sun hits, so the wall never reads as
 * the colour that was picked. Real paint under the same light does vary, but
 * far less than the raw ratio suggests, because the eye adapts locally.
 */
export const ILLUMINATION_RANGE = 0.35

/** How far the brightest wall pixels lerp toward white, for sheen. */
export const HIGHLIGHT_RANGE = 0.35

const towardGrey = (channel: number, pixelLuma: number, amount: number) =>
  channel + (pixelLuma - channel) * amount

/**
 * Relative illumination at a pixel, as a multiple of the wall's average.
 *
 * Shading is multiplicative: a wall in half the light reads at half the
 * value, whatever colour it is painted. Treating it as an additive offset
 * instead (target luma plus the source's deviation from the mean) needs a
 * different gain either side of the mean, and those gains diverge badly for
 * pale paint, flattening highlights while stretching shadows.
 *
 * The ratio is compressed toward 1 so the photo's full range does not survive
 * into the result; see `ILLUMINATION_RANGE`.
 */
export const illumination = (srcLuma: number, wallLuma: number) => {
  const ratio = wallLuma < 1 ? 1 : srcLuma / wallLuma
  return 1 + (ratio - 1) * ILLUMINATION_RANGE
}

export const shadePixel = (
  illum: number,
  target: Rgb,
  desaturation = DEFAULT_DESATURATION,
): Rgb => {
  let r: number
  let g: number
  let b: number
  if (illum <= 1) {
    r = target.r * illum
    g = target.g * illum
    b = target.b * illum
  } else {
    // Above the wall average there is no headroom to scale into, so the extra
    // light shows as the surface washing toward white rather than as a
    // brighter version of the paint.
    const k = Math.min(1, (illum - 1) * HIGHLIGHT_RANGE)
    r = target.r + (255 - target.r) * k
    g = target.g + (255 - target.g) * k
    b = target.b + (255 - target.b) * k
  }
  const wash = Math.min(1, illum) * desaturation * HIGHLIGHT_RANGE
  const pixelLuma = luma(r, g, b)
  return {
    r: clamp255(towardGrey(r, pixelLuma, wash)),
    g: clamp255(towardGrey(g, pixelLuma, wash)),
    b: clamp255(towardGrey(b, pixelLuma, wash)),
  }
}
