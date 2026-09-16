import { AutoModel, AutoProcessor, type PreTrainedModel, RawImage } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/segformer-b0-finetuned-ade-512-512'
const WALL_CLASS = 0

export type SegmentRequest = { width: number; height: number; buffer: ArrayBuffer }
export type SegmentResponse =
  | { type: 'status'; message: string; progress?: number }
  /** Per-pixel P(wall), 0-255. Thresholded on the main thread so the
   *  sensitivity slider never re-runs inference. */
  | { type: 'result'; confidence: ArrayBuffer }
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
      // Softmax, shifted by the max logit so exp() cannot overflow. Keeping the
      // probability rather than the argmax is what lets the UI re-threshold.
      let max = data[p]
      for (let c = 1; c < classes; c++) {
        const v = data[c * plane + p]
        if (v > max) max = v
      }
      let sum = 0
      for (let c = 0; c < classes; c++) sum += Math.exp(data[c * plane + p] - max)
      small[p] = Math.round((Math.exp(data[WALL_CLASS * plane + p] - max) / sum) * 255)
    }

    // Bilinear rather than nearest: the field is continuous now, and nearest
    // would stair-step the boundary into the ~12x upscale.
    const confidence = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      const fy = Math.min(lh - 1, ((y + 0.5) * lh) / height - 0.5)
      const y0 = Math.max(0, Math.floor(fy))
      const y1 = Math.min(lh - 1, y0 + 1)
      const wy = fy - y0
      for (let x = 0; x < width; x++) {
        const fx = Math.min(lw - 1, ((x + 0.5) * lw) / width - 0.5)
        const x0 = Math.max(0, Math.floor(fx))
        const x1 = Math.min(lw - 1, x0 + 1)
        const wx = fx - x0
        const top = small[y0 * lw + x0] * (1 - wx) + small[y0 * lw + x1] * wx
        const bottom = small[y1 * lw + x0] * (1 - wx) + small[y1 * lw + x1] * wx
        confidence[y * width + x] = top * (1 - wy) + bottom * wy
      }
    }
    post({ type: 'result', confidence: confidence.buffer }, [confidence.buffer])
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
