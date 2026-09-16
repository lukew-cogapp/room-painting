import { useCallback, useEffect, useRef } from 'react'

export type Tool = 'wand' | 'brush' | 'erase' | 'dropper' | 'grey'

type Props = {
  image: ImageData | null
  mask: Uint8Array | null
  /** Bumped on every mask edit; the mask is mutated in place, so its identity
   *  alone would not tell React to repaint. */
  maskVersion: number
  brushSize: number
  tool: Tool
  onPick: (x: number, y: number, drag: boolean) => void
}

const MASK_TINT = [56, 189, 248] as const

export const EditorCanvas = ({ image, mask, maskVersion, brushSize, tool, onPick }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: maskVersion is the only signal that in-place mask edits happened
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!mask) {
      ctx.putImageData(image, 0, 0)
      return
    }
    const overlay = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
    const d = overlay.data
    for (let p = 0; p < mask.length; p++) {
      const a = mask[p]
      if (a === 0) continue
      const w = (a / 255) * 0.45
      const i = p * 4
      d[i] += (MASK_TINT[0] - d[i]) * w
      d[i + 1] += (MASK_TINT[1] - d[i + 1]) * w
      d[i + 2] += (MASK_TINT[2] - d[i + 2]) * w
    }
    ctx.putImageData(overlay, 0, 0)
  }, [image, mask, maskVersion])

  const toImageCoords = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }, [])

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toImageCoords(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = tool === 'brush' || tool === 'erase'
    onPick(point.x, point.y, false)
  }

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return
    const point = toImageCoords(event)
    if (point) onPick(point.x, point.y, true)
  }

  const stop = () => {
    dragging.current = false
  }

  const cursor = tool === 'dropper' || tool === 'grey' ? 'crosshair' : 'cell'

  if (!image) return null

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      style={{ cursor, touchAction: 'none' }}
      className="max-h-[70vh] w-full rounded-lg border border-slate-700 object-contain"
      aria-label={`Room photo, ${tool} tool active, brush ${brushSize}px`}
    />
  )
}
