import { useRef, useState } from 'react'
import styles from './Page.module.css'
import m from './Formateador.module.css'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const match = header.match(/filename[^;=\n]*=(?:(\\?['"])(.*?)\1|(?:[^\s]+'.*?')?([^;\n]*))/)
  return (match && (match[2] || match[3])) || fallback
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Formateador() {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [wantPlain, setWantPlain] = useState(true)
  const [wantPdf, setWantPdf] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handling ───────────────────────────────────────────────────────────

  function applyFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.docx')) {
      setError('Solo se aceptan archivos .docx')
      return
    }
    setFile(f)
    setError(null)
  }

  function clearFile() {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave() {
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) applyFile(f)
  }

  // ── Checkbox logic: at least one must remain checked ────────────────────────

  function togglePlain() {
    if (wantPlain && !wantPdf) return // can't uncheck the only one
    setWantPlain((v) => !v)
  }

  function togglePdf() {
    if (wantPdf && !wantPlain) return
    setWantPdf((v) => !v)
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)

    // Build list of requests (one per selected output, same as original)
    const requests: Array<{ plain: string; pdf: string; fallback: string }> = []
    if (wantPlain) requests.push({ plain: 'true',  pdf: 'false', fallback: 'comunicado_plain.docx' })
    if (wantPdf)   requests.push({ plain: 'false', pdf: 'true',  fallback: 'comunicado.pdf' })

    try {
      for (const opts of requests) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('plain', opts.plain)
        formData.append('pdf', opts.pdf)

        const res = await fetch(`${import.meta.env.VITE_FLASK_URL}/flask/comunicado/process`, { method: 'POST', body: formData })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error || `Error ${res.status}`)
        }

        const blob = await res.blob()
        const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), opts.fallback)
        triggerDownload(blob, filename)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Formateador de Comunicados</h1>

      <form className="card" onSubmit={handleSubmit}>

        {/* Drop zone */}
        <div className={m.field}>
          <label className={m.label}>Archivo .docx</label>
          <div
            className={`${m.dropZone} ${dragging ? m.dropZoneOver : ''} ${file ? m.dropZoneHasFile : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            {file ? (
              <div className={m.fileRow}>
                <div className={m.fileInfo}>
                  <span className={m.fileName}>{file.name}</span>
                  <span className={m.fileSize}>{formatBytes(file.size)}</span>
                </div>
                <button
                  type="button"
                  className={m.clearBtn}
                  onClick={(e) => { e.stopPropagation(); clearFile() }}
                  aria-label="Quitar archivo"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className={m.dropPrompt}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span><u>Elige un archivo</u> o arrástralo aquí</span>
                <span className={m.dropHint}>.docx — máximo 16 MB</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            className={m.hiddenInput}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFile(f) }}
          />
        </div>

        {/* Output options */}
        <div className={m.field}>
          <span className={m.label}>Salidas</span>
          <label className={m.checkRow}>
            <input
              type="checkbox"
              className={m.checkbox}
              checked={wantPlain}
              onChange={togglePlain}
            />
            Versión lisa (.docx)
            <span className={m.badge}>DOCX</span>
          </label>
          <label className={m.checkRow}>
            <input
              type="checkbox"
              className={m.checkbox}
              checked={wantPdf}
              onChange={togglePdf}
            />
            PDF
            <span className={m.badge}>PDF</span>
          </label>
        </div>

        {/* Loading */}
        {loading && (
          <div className={m.loadingRow}>
            <span className={m.spinner} />
            Procesando comunicado…
          </div>
        )}

        {/* Error */}
        {error && <p className={m.msgErr}>{error}</p>}

        <div className={styles.actions}>
          <button
            className="btn-primary"
            type="submit"
            disabled={!file || loading}
          >
            {loading ? 'Generando…' : 'Generar'}
          </button>
        </div>
      </form>
    </div>
  )
}
