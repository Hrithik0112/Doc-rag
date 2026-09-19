import { useRef, useState } from 'react'
import { uploadDocument } from '../api'

export function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await uploadDocument(file)
      onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex-none border-t border-hair/70 p-3">
      <button
        type="button"
        className={`press block w-full border border-dashed px-4 py-5 text-center text-[13px] transition-colors ${
          over
            ? 'border-solid border-glow bg-glow/10 text-glow shadow-[0_0_30px_-8px_var(--accent)]'
            : 'border-hair text-dim hover:border-halo hover:text-text'
        }`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files) }}
      >
        <strong className="mb-0.5 block font-medium text-text">
          {busy ? 'Reading the file' : 'Add a PDF'}
        </strong>
        {busy ? 'Splitting it into passages' : 'Drop it here, or click to choose'}
      </button>
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
      <input ref={input} type="file" accept="application/pdf" hidden
             onChange={(e) => send(e.target.files)} />
    </div>
  )
}
