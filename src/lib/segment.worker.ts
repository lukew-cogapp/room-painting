import { AutoModel, AutoProcessor, type PreTrainedModel, RawImage } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/segformer-b0-finetuned-ade-512-512'
const WALL_CLASS = 0

export type SegmentRequest = { width: number; height: number; buffer: ArrayBuffer }
export type SegmentResponse =
  | { type: 'status'; message: string; progress?: number }
  | { type: 'result'; mask: ArrayBuffer }
  | { type: 'error'; message: string }

const post = (msg: SegmentResponse, transfer: Transferable[] = []) =>
  self.postMessage(msg, { transfer })

let ready: Promise<{
  model: PreTrainedModel
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>
}> | null = null

/**
 * Weight downloads report bytes; the ~27 MB ONNX runtime that precedes them
 * does not, so the bar only appears once weights start and the runtime fetch
 * is covered by an indeterminate message instead.
 */
const trackProgress = (report: { status: string; progress?: number }) => {
  if (report.status === 'progress' && typeof report.progress === 'number') {
    post({ type: 'status', message: 'Downloading model weights', progress: report.progress })
  }
}

const load = () => {
  ready ??= (async () => {
    const [model, processor] = await Promise.all([
      AutoModel.from_pretrained(MODEL_ID, { dtype: 'q8', progress_callback: trackProgress }),
      AutoProcessor.from_pretrained(MODEL_ID),
    ])
    return { model, processor }
  })()
  return ready
}

self.onmessage = async (event: MessageEvent<SegmentRequest>) => {
  const { width, height, buffer } = event.data
  try {
    post({ type: 'status', message: 'Fetching runtime (~27 MB, first run only)' })
    const { model, processor } = await load()

    post({ type: 'status', message: 'Finding walls' })
    const image = new RawImage(new Uint8ClampedArray(buffer), width, height, 4)
    const inputs = await processor(image)
    const { logits } = await model(inputs)

    // logits are [1, classes, h, w] at the model's own resolution; argmax per
    // pixel there, then nearest-neighbour up to the photo's dimensions.
    const [, classes, lh, lw] = logits.dims as number[]
    const data = logits.data as Float32Array
    const small = new Uint8Array(lh * lw)
    const plane = lh * lw
    for (let p = 0; p < plane; p++) {
      let best = 0
      let bestVal = data[p]
      for (let c = 1; c < classes; c++) {
        const v = data[c * plane + p]
        if (v > bestVal) {
          bestVal = v
          best = c
        }
      }
      small[p] = best === WALL_CLASS ? 255 : 0
    }

    const mask = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      const sy = Math.min(lh - 1, ((y * lh) / height) | 0)
      for (let x = 0; x < width; x++) {
        const sx = Math.min(lw - 1, ((x * lw) / width) | 0)
        mask[y * width + x] = small[sy * lw + sx]
      }
    }
    post({ type: 'result', mask: mask.buffer }, [mask.buffer])
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
