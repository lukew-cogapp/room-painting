import { useEffect, useRef, useState } from 'react'

type Props = { onFile: (file: File) => void; busy: boolean }

const firstImage = (items: DataTransferItemList | null, files: FileList | null) => {
  if (items) {
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file?.type.startsWith('image/')) return file
      }
    }
  }
  return files?.[0]?.type.startsWith('image/') ? files[0] : null
}

export const PhotoDrop = ({ onFile, busy }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  // Paste only makes sense at document level; the drop zone is never focused
  // when someone hits Cmd+V straight after copying a screenshot.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (busy) return
      const file = firstImage(event.clipboardData?.items ?? null, null)
      if (file) onFile(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [onFile, busy])

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setOver(false)
    if (busy) return
    const file = firstImage(event.dataTransfer.items, event.dataTransfer.files)
    if (file) onFile(file)
  }

  return (
    <section
      aria-label="Photo drop zone"
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        over ? 'border-sky-400 bg-sky-500/10' : 'border-slate-600 bg-slate-900/40'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
        className="sr-only"
      />
      {busy ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-300" role="status">
          <span className="size-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
          Decoding photo
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-300">Drop a photo here, or paste one</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 rounded bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
          >
            Choose file
          </button>
        </>
      )}
    </section>
  )
}
