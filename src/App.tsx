import { useCallback, useMemo, useRef, useState } from 'react'
import { EditorCanvas, type Tool } from './components/EditorCanvas'
import { Loader } from './components/Loader'
import { PhotoDrop } from './components/PhotoDrop'
import { ResultGrid, type Variant } from './components/ResultGrid'
import { DEFAULT_DESATURATION, hexToRgb, rgbToHex } from './lib/colour'
import {
  createMask,
  featherMask,
  floodFill,
  paintBrush,
  recolour,
  thresholdConfidence,
} from './lib/mask'
import { PAINTS } from './lib/paints'
import { useSegmenter } from './lib/useSegmenter'
import {
  applyWhiteBalance,
  greyPointGains,
  NEUTRAL_WB,
  type WhiteBalance,
} from './lib/whiteBalance'

const MAX_EDGE = 1600

const loadImageData = async (file: File): Promise<ImageData> => {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return ctx.getImageData(0, 0, width, height)
}

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
    <h2 className="text-sm font-medium text-slate-300">{title}</h2>
    {children}
  </section>
)

const toolButton = (active: boolean) =>
  `rounded px-3 py-1.5 text-sm ${active ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`

const App = () => {
  const [original, setOriginal] = useState<ImageData | null>(null)
  const [wb, setWb] = useState<WhiteBalance>(NEUTRAL_WB)
  const [mask, setMask] = useState<Uint8Array | null>(null)
  const [maskVersion, setMaskVersion] = useState(0)
  const [tool, setTool] = useState<Tool>('wand')
  const [tolerance, setTolerance] = useState(28)
  const [brushSize, setBrushSize] = useState(30)
  const [feather, setFeather] = useState(2)
  const [colours, setColours] = useState<string[]>([])
  const [picker, setPicker] = useState('#3b6ea5')
  const [variants, setVariants] = useState<Variant[]>([])
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sensitivity, setSensitivity] = useState(50)
  const [realism, setRealism] = useState(Math.round(DEFAULT_DESATURATION * 100))
  const [hasConfidence, setHasConfidence] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const maskRef = useRef<Uint8Array | null>(null)
  const confidenceRef = useRef<Uint8Array | null>(null)
  const sensitivityRef = useRef(sensitivity)
  sensitivityRef.current = sensitivity

  const corrected = useMemo(
    () => (original ? applyWhiteBalance(original, wb) : null),
    [original, wb],
  )

  const greySet = wb.gains.some((g) => g !== 1)

  const setMaskData = useCallback((next: Uint8Array | null) => {
    maskRef.current = next
    setMask(next)
    setMaskVersion((v) => v + 1)
  }, [])

  const applyThreshold = useCallback(
    (percent: number) => {
      const confidence = confidenceRef.current
      if (!confidence) return
      setMaskData(thresholdConfidence(confidence, (percent / 100) * 255))
    },
    [setMaskData],
  )

  const segmenter = useSegmenter(
    useCallback(
      (confidence: Uint8Array) => {
        confidenceRef.current = confidence
        setHasConfidence(true)
        setMaskData(thresholdConfidence(confidence, (sensitivityRef.current / 100) * 255))
      },
      [setMaskData],
    ),
  )

  const handleFile = async (file: File) => {
    setLoadingPhoto(true)
    try {
      const data = await loadImageData(file)
      setOriginal(data)
      setWb(NEUTRAL_WB)
      setMaskData(null)
      confidenceRef.current = null
      setHasConfidence(false)
      setVariants([])
    } finally {
      setLoadingPhoto(false)
    }
  }

  const handlePick = (x: number, y: number, drag: boolean) => {
    if (!corrected) return
    const px = Math.floor(x)
    const py = Math.floor(y)
    if (px < 0 || py < 0 || px >= corrected.width || py >= corrected.height) return
    const i = (py * corrected.width + px) * 4

    // Sampled from the untouched photo: reading the corrected pixel would
    // stack each pick on the last one and over-correct.
    if (tool === 'grey' && original) {
      const d = original.data
      setWb((prev) => ({ ...prev, gains: greyPointGains(d[i], d[i + 1], d[i + 2]) }))
      setTool('wand')
      return
    }
    if (tool === 'dropper') {
      const d = corrected.data
      const hex = rgbToHex({ r: d[i], g: d[i + 1], b: d[i + 2] })
      setPicker(hex)
      setColours((prev) => (prev.includes(hex) ? prev : [...prev, hex]))
      return
    }

    const next = maskRef.current ?? createMask(corrected.width, corrected.height)
    if (tool === 'wand') {
      if (!drag) floodFill(corrected, px, py, tolerance, next)
    } else {
      paintBrush(next, corrected.width, corrected.height, px, py, brushSize / 2, tool === 'erase')
    }
    setMaskData(next)
  }

  // Recolouring several full-size images blocks paint, so yield a frame first
  // and let the overlay render before the loop starts.
  const generate = () => {
    if (!corrected || !mask) return
    setGenerating(true)
    requestAnimationFrame(() => {
      const soft = featherMask(mask, corrected.width, corrected.height, feather)
      setVariants(
        colours.map((hex) => ({
          hex,
          image: recolour(corrected, soft, hexToRgb(hex), realism / 100),
        })),
      )
      setGenerating(false)
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const addColour = () => {
    setColours((prev) => (prev.includes(picker) ? prev : [...prev, picker]))
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 text-slate-100">
      <header>
        <h1 className="text-2xl font-semibold">Room Painting</h1>
        <p className="text-sm text-slate-400">
          Everything runs in your browser. No photo leaves this device.
        </p>
      </header>

      <Panel title="1. Photo">
        <PhotoDrop onFile={handleFile} busy={loadingPhoto} />
      </Panel>

      {corrected && (
        <>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="relative">
              {(segmenter.busy || generating) && (
                <Loader
                  status={generating ? 'Painting walls' : segmenter.status}
                  progress={generating ? null : segmenter.progress}
                />
              )}
              <EditorCanvas
                image={corrected}
                mask={mask}
                maskVersion={maskVersion}
                brushSize={brushSize}
                tool={tool}
                onPick={handlePick}
              />
            </div>

            <div className="space-y-6">
              <Panel title="2. White balance">
                <button
                  type="button"
                  onClick={() => setTool('grey')}
                  className={toolButton(tool === 'grey')}
                >
                  {tool === 'grey' ? 'Click a grey area…' : 'Pick neutral grey'}
                </button>
                <p className="text-xs text-slate-400">
                  {greySet
                    ? 'Grey point set. The sliders adjust on top of it.'
                    : 'No grey point set.'}
                </p>
                <label className="block text-xs text-slate-400">
                  Temperature
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={wb.temp}
                    onChange={(e) => setWb({ ...wb, temp: Number(e.target.value) })}
                    className="w-full"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Tint
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={wb.tint}
                    onChange={(e) => setWb({ ...wb, tint: Number(e.target.value) })}
                    className="w-full"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setWb(NEUTRAL_WB)}
                  disabled={!greySet && wb.temp === 0 && wb.tint === 0}
                  className="text-xs text-slate-400 underline disabled:opacity-40 disabled:no-underline"
                >
                  Reset grey point and sliders
                </button>
              </Panel>

              <Panel title="3. Select the wall">
                <button
                  type="button"
                  onClick={() => segmenter.detect(corrected)}
                  disabled={segmenter.busy}
                  className="w-full rounded bg-green-700 px-3 py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
                >
                  {segmenter.busy ? 'Working…' : 'Detect walls automatically'}
                </button>
                {segmenter.error && <p className="text-xs text-rose-400">{segmenter.error}</p>}
                {hasConfidence && (
                  <label className="block text-xs text-slate-300">
                    Detection sensitivity: {sensitivity}%
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={sensitivity}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        setSensitivity(next)
                        applyThreshold(next)
                      }}
                      className="w-full"
                    />
                    <span className="text-slate-400">
                      Lower grabs more of the uncertain edges. Re-thresholds instantly, no
                      re-detection.
                    </span>
                  </label>
                )}
                <div className="border-slate-700 border-t pt-3">
                  <p className="mb-2 text-xs text-slate-400">
                    Fix it by hand. These tools edit the selection; they do not change what
                    auto-detect finds.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['wand', 'brush', 'erase'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTool(t)}
                        className={toolButton(tool === t)}
                      >
                        {t === 'wand' ? 'Magic wand' : t === 'brush' ? 'Brush' : 'Erase'}
                      </button>
                    ))}
                  </div>
                </div>
                {tool === 'wand' && (
                  <label className="block text-xs text-slate-400">
                    Magic wand tolerance: {tolerance}
                    <input
                      type="range"
                      min={2}
                      max={90}
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      className="w-full"
                    />
                  </label>
                )}
                {(tool === 'brush' || tool === 'erase') && (
                  <label className="block text-xs text-slate-400">
                    Brush: {brushSize}px
                    <input
                      type="range"
                      min={4}
                      max={160}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full"
                    />
                  </label>
                )}
                <label className="block text-xs text-slate-400">
                  Edge feather: {feather}px
                  <input
                    type="range"
                    min={0}
                    max={12}
                    value={feather}
                    onChange={(e) => setFeather(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setMaskData(null)}
                  className="text-xs text-slate-400 underline"
                >
                  Clear selection
                </button>
              </Panel>

              <Panel title="4. Colours">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Wall colour"
                    value={picker}
                    onChange={(e) => setPicker(e.target.value)}
                    className="size-9 rounded border border-slate-600 bg-transparent"
                  />
                  <button type="button" onClick={addColour} className={toolButton(false)}>
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setTool('dropper')}
                    className={toolButton(tool === 'dropper')}
                  >
                    Eyedropper
                  </button>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-300">Popular paint colours</summary>
                  <ul className="mt-2 space-y-1">
                    {PAINTS.map((paint) => {
                      const picked = colours.includes(paint.hex)
                      return (
                        <li key={paint.hex}>
                          <button
                            type="button"
                            aria-pressed={picked}
                            onClick={() =>
                              setColours((prev) =>
                                picked ? prev.filter((c) => c !== paint.hex) : [...prev, paint.hex],
                              )
                            }
                            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-800 ${
                              picked ? 'bg-slate-800' : ''
                            }`}
                          >
                            <span
                              className="size-5 shrink-0 rounded border border-slate-600"
                              style={{ background: paint.hex }}
                            />
                            <span className="text-slate-200">{paint.name}</span>
                            <span className="text-slate-400">{paint.brand}</span>
                            {picked && <span className="ml-auto text-slate-400">Added</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="mt-2 text-slate-400">
                    Approximations from colour databases, not brand data. Always check a tester pot.
                  </p>
                </details>
                <ul className="flex flex-wrap gap-2">
                  {colours.map((hex) => (
                    <li key={hex}>
                      <button
                        type="button"
                        onClick={() => setColours((prev) => prev.filter((c) => c !== hex))}
                        title={`Remove ${hex}`}
                        className="size-8 rounded border border-slate-600"
                        style={{ background: hex }}
                      />
                    </li>
                  ))}
                </ul>
                <label className="block text-xs text-slate-300">
                  Realism: {realism}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={realism}
                    onChange={(e) => setRealism(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="text-slate-400">
                    Higher washes the colour out toward the light, like real paint. 0% keeps the
                    swatch exact and reads flat.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={generate}
                  disabled={!mask || colours.length === 0}
                  className="w-full rounded bg-sky-700 px-3 py-2 text-sm font-medium hover:bg-sky-800 disabled:opacity-50"
                >
                  Generate {colours.length} version{colours.length === 1 ? '' : 's'}
                </button>
              </Panel>
            </div>
          </div>

          <div ref={resultsRef}>
            <ResultGrid variants={variants} original={corrected} />
          </div>
        </>
      )}
    </main>
  )
}

export default App
