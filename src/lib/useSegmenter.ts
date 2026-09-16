import { useCallback, useEffect, useRef, useState } from 'react'
import type { SegmentResponse } from './segment.worker'

export type SegmenterState = {
  busy: boolean
  status: string
  progress: number | null
  error: string | null
}

export const useSegmenter = (onMask: (mask: Uint8Array) => void) => {
  const workerRef = useRef<Worker | null>(null)
  const [state, setState] = useState<SegmenterState>({
    busy: false,
    status: '',
    progress: null,
    error: null,
  })
  const callback = useRef(onMask)
  callback.current = onMask

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const detect = useCallback((image: ImageData) => {
    workerRef.current ??= new Worker(new URL('./segment.worker.ts', import.meta.url), {
      type: 'module',
    })
    const worker = workerRef.current
    worker.onmessage = (event: MessageEvent<SegmentResponse>) => {
      const msg = event.data
      if (msg.type === 'status')
        setState({
          busy: true,
          status: msg.message,
          progress: msg.progress ?? null,
          error: null,
        })
      if (msg.type === 'error')
        setState({ busy: false, status: '', progress: null, error: msg.message })
      if (msg.type === 'result') {
        setState({ busy: false, status: '', progress: null, error: null })
        callback.current(new Uint8Array(msg.mask))
      }
    }
    setState({ busy: true, status: 'Starting', progress: null, error: null })
    const copy = new Uint8ClampedArray(image.data)
    worker.postMessage({ width: image.width, height: image.height, buffer: copy.buffer }, [
      copy.buffer,
    ])
  }, [])

  return { ...state, detect }
}
