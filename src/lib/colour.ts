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
 */
export const shadePixel = (srcLuma: number, target: Rgb, targetLuma: number): Rgb => {
  if (srcLuma <= targetLuma) {
    const k = targetLuma === 0 ? 0 : srcLuma / targetLuma
    return { r: clamp255(target.r * k), g: clamp255(target.g * k), b: clamp255(target.b * k) }
  }
  const k = (srcLuma - targetLuma) / (255 - targetLuma || 1)
  return {
    r: clamp255(target.r + (255 - target.r) * k),
    g: clamp255(target.g + (255 - target.g) * k),
    b: clamp255(target.b + (255 - target.b) * k),
  }
}
