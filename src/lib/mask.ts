import { illumination, luma, type Rgb, shadePixel } from './colour'

export type Mask = Uint8Array

export const createMask = (width: number, height: number): Mask => new Uint8Array(width * height)

/**
 * Scanline flood fill over pixels within `tolerance` of the seed colour.
 *
 * Tolerance is squared-distance in RGB so the slider stays linear-ish in
 * perceived strictness without a per-pixel sqrt.
 */
export const floodFill = (
  img: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
  mask: Mask,
): void => {
  const { width, height, data } = img
  const sx = Math.round(startX)
  const sy = Math.round(startY)
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return

  const seed = (sy * width + sx) * 4
  const sr = data[seed]
  const sg = data[seed + 1]
  const sb = data[seed + 2]
  const limit = tolerance * tolerance * 3

  const matches = (p: number) => {
    const dr = data[p * 4] - sr
    const dg = data[p * 4 + 1] - sg
    const db = data[p * 4 + 2] - sb
    return dr * dr + dg * dg + db * db <= limit
  }

  const seen = new Uint8Array(width * height)
  const stack: number[] = [sx, sy]
  while (stack.length > 0) {
    const y = stack.pop() as number
    let x = stack.pop() as number
    let p = y * width + x
    while (x > 0 && !seen[p - 1] && matches(p - 1)) {
      x--
      p--
    }
    let spanUp = false
    let spanDown = false
    for (; x < width && !seen[p] && matches(p); x++, p++) {
      seen[p] = 1
      mask[p] = 255
      const up = p - width
      if (y > 0) {
        if (!seen[up] && matches(up)) {
          if (!spanUp) {
            stack.push(x, y - 1)
            spanUp = true
          }
        } else spanUp = false
      }
      const down = p + width
      if (y < height - 1) {
        if (!seen[down] && matches(down)) {
          if (!spanDown) {
            stack.push(x, y + 1)
            spanDown = true
          }
        } else spanDown = false
      }
    }
  }
}

export const paintBrush = (
  mask: Mask,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  erase: boolean,
): void => {
  const value = erase ? 0 : 255
  const r2 = radius * radius
  const minY = Math.max(0, Math.floor(cy - radius))
  const maxY = Math.min(height - 1, Math.ceil(cy + radius))
  const minX = Math.max(0, Math.floor(cx - radius))
  const maxX = Math.min(width - 1, Math.ceil(cx + radius))
  for (let y = minY; y <= maxY; y++) {
    const dy = y - cy
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy <= r2) mask[y * width + x] = value
    }
  }
}

/** Box-blur the mask edge so recoloured walls don't show a hard jagged border. */
export const featherMask = (mask: Mask, width: number, height: number, radius: number): Mask => {
  if (radius < 1) return mask
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length)
    const outer = horizontal ? height : width
    const inner = horizontal ? width : height
    const step = horizontal ? 1 : width
    for (let o = 0; o < outer; o++) {
      const base = horizontal ? o * width : o
      let sum = 0
      let count = 0
      for (let i = 0; i <= radius && i < inner; i++) {
        sum += src[base + i * step]
        count++
      }
      for (let i = 0; i < inner; i++) {
        out[base + i * step] = sum / count
        const add = i + radius + 1
        const drop = i - radius
        if (add < inner) {
          sum += src[base + add * step]
          count++
        }
        if (drop >= 0) {
          sum -= src[base + drop * step]
          count--
        }
      }
    }
    return out
  }
  return pass(pass(mask, true), false)
}

/** Mean luma over the masked pixels, the reference illumination is relative to. */
const meanLuma = (src: ImageData, mask: Mask): number => {
  const s = src.data
  let sum = 0
  let count = 0
  for (let p = 0; p < mask.length; p++) {
    if (mask[p] === 0) continue
    const i = p * 4
    sum += luma(s[i], s[i + 1], s[i + 2])
    count++
  }
  return count === 0 ? 128 : sum / count
}

export const recolour = (
  src: ImageData,
  mask: Mask,
  target: Rgb,
  desaturation?: number,
): ImageData => {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
  const d = out.data
  const s = src.data
  const wallLuma = meanLuma(src, mask)

  for (let p = 0; p < mask.length; p++) {
    const a = mask[p]
    if (a === 0) continue
    const i = p * 4
    const illum = illumination(luma(s[i], s[i + 1], s[i + 2]), wallLuma)
    const painted = shadePixel(illum, target, desaturation)
    const w = a / 255
    d[i] = s[i] + (painted.r - s[i]) * w
    d[i + 1] = s[i + 1] + (painted.g - s[i + 1]) * w
    d[i + 2] = s[i + 2] + (painted.b - s[i + 2]) * w
  }
  return out
}

/**
 * Threshold the model's per-pixel P(wall) into a mask.
 *
 * Values just above the cut are kept partly transparent so the boundary
 * follows the model's own uncertainty instead of a hard step.
 */
export const thresholdConfidence = (confidence: Uint8Array, threshold: number): Mask => {
  const out = new Uint8Array(confidence.length)
  // Shrink the ramp near the top of the range, or a high threshold leaves no
  // headroom above it and nothing ever reaches full opacity.
  const soft = Math.max(1, Math.min(32, 255 - threshold))
  for (let p = 0; p < confidence.length; p++) {
    const c = confidence[p]
    if (c <= threshold) continue
    out[p] = c >= threshold + soft ? 255 : ((c - threshold) / soft) * 255
  }
  return out
}
