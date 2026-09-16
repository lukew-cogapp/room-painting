import { useEffect, useRef, useState } from 'react'
import { buildContactSheet, downloadCanvas } from '../lib/contactSheet'

export type Variant = { hex: string; image: ImageData }

const drawTo = (canvas: HTMLCanvasElement | null, image: ImageData) => {
  if (!canvas) return
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')?.putImageData(image, 0, 0)
}

const download = (image: ImageData, hex: string) => {
  const canvas = document.createElement('canvas')
  drawTo(canvas, image)
  downloadCanvas(canvas, `room-${hex.slice(1)}.png`)
}

const Thumb = ({ variant, onOpen }: { variant: Variant; onOpen: () => void }) => {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => drawTo(ref.current, variant.image), [variant.image])
  return (
    <figure className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Enlarge preview of ${variant.hex}`}
        className="group relative block w-full cursor-zoom-in"
      >
        <canvas ref={ref} className="w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="rounded bg-slate-900/90 px-2 py-1 text-xs font-medium text-slate-100">
            Click to enlarge
          </span>
        </span>
      </button>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span
            className="size-4 rounded-full border border-slate-600"
            style={{ background: variant.hex }}
          />
          <code className="text-slate-300">{variant.hex}</code>
        </span>
        <button
          type="button"
          onClick={() => download(variant.image, variant.hex)}
          className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
        >
          PNG
        </button>
      </figcaption>
    </figure>
  )
}

export const ResultGrid = ({
  variants,
  original,
}: {
  variants: Variant[]
  original: ImageData | null
}) => {
  const [open, setOpen] = useState<Variant | null>(null)
  const large = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (open) drawTo(large.current, open.image)
  }, [open])

  if (variants.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-300">Results</h2>
        <button
          type="button"
          onClick={() => {
            const cells = [
              ...(original ? [{ label: 'Original', image: original }] : []),
              ...variants.map((v) => ({ label: v.hex, image: v.image, swatch: v.hex })),
            ]
            downloadCanvas(buildContactSheet(cells), 'room-comparison.png')
          }}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
        >
          Download comparison sheet
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {variants.map((v) => (
          <Thumb key={v.hex} variant={v} onOpen={() => setOpen(v)} />
        ))}
      </div>
      {open && (
        <dialog
          open
          onClose={() => setOpen(null)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}
          className="fixed inset-0 z-10 m-0 flex size-full items-center justify-center bg-black/80 p-6"
        >
          {/* Backdrop dismiss duplicates the Close button, so it carries no
              accessible name of its own; the canvas above it keeps one. */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(null)}
            className="absolute inset-0 cursor-zoom-out"
          />
          <canvas
            ref={large}
            aria-label={`Enlarged preview of ${open.hex}`}
            role="img"
            className="pointer-events-none relative max-h-[90vh] max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="absolute right-6 top-6 rounded bg-slate-800/90 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-700"
          >
            Close
          </button>
        </dialog>
      )}
    </section>
  )
}
