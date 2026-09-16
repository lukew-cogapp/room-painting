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

const towardGrey = (channel: number, pixelLuma: number, amount: number) =>
  channel + (pixelLuma - channel) * amount

export const shadePixel = (
  srcLuma: number,
  target: Rgb,
  targetLuma: number,
  desaturation = DEFAULT_DESATURATION,
): Rgb => {
  let r: number
  let g: number
  let b: number
  if (srcLuma <= targetLuma) {
    const k = targetLuma === 0 ? 0 : srcLuma / targetLuma
    r = target.r * k
    g = target.g * k
    b = target.b * k
  } else {
    const k = (srcLuma - targetLuma) / (255 - targetLuma || 1)
    r = target.r + (255 - target.r) * k
    g = target.g + (255 - target.g) * k
    b = target.b + (255 - target.b) * k
  }
  const wash = (srcLuma / 255) * desaturation
  const pixelLuma = luma(r, g, b)
  return {
    r: clamp255(towardGrey(r, pixelLuma, wash)),
    g: clamp255(towardGrey(g, pixelLuma, wash)),
    b: clamp255(towardGrey(b, pixelLuma, wash)),
  }
}
