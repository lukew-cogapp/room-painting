import { useEffect, useState } from 'react'

type Props = { status: string; progress: number | null }

export const Loader = ({ status, progress }: Props) => {
  // The runtime fetch reports no bytes, so elapsed time is the only signal
  // that a long first run is still moving.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-950/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <span className="size-8 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      <p className="text-sm text-slate-200">{status}</p>
      {progress === null ? (
        <p className="text-xs text-slate-400">{elapsed}s elapsed</p>
      ) : (
        <div className="w-48 space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-xs text-slate-400">
            {Math.round(progress)}% · {elapsed}s
          </p>
        </div>
      )}
    </div>
  )
}
