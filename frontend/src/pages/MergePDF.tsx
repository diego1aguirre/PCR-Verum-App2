import { useRef, useState } from 'react'
import styles from './Page.module.css'
import m from './MergePDF.module.css'

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueueEntry {
  id: number
  file: File
}

let _nextId = 0
function nextId() { return ++_nextId }

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const match = header.match(/filename[^;=\n]*=(?:(\\?['"])(.*?)\1|(?:[^\s]+'.*?')?([^;\n]*))/)
  return (match && (match[2] || match[3])) || fallback
}

function ext(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toUpperCase() : ''
}

/** Normalise a user-supplied filename to a .pdf download name.
 *  "" | whitespace → "merged.pdf"
 *  "reporte"       → "reporte.pdf"
 *  "reporte.pdf"   → "reporte.pdf"
 *  "reporte.PDF"   → "reporte.pdf"
 */
function computeOutputFilename(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'merged.pdf'
  return trimmed.replace(/\.pdf$/i, '') + '.pdf'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MergePDF() {
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [enumerate, setEnumerate] = useState(true)
  const [outputName, setOutputName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)

  // ── Drag handlers ───────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  // ── Queue mutations ─────────────────────────────────────────────────────────

  function addFiles(files: FileList | null) {
    if (!files) return
    const entries: QueueEntry[] = Array.from(files).map((f) => ({ id: nextId(), file: f }))
    setQueue((q) => [...q, ...entries])
    setError(null)
    setSuccessMsg(null)
  }

  function removeEntry(id: number) {
    setQueue((q) => q.filter((e) => e.id !== id))
  }

  function moveUp(index: number) {
    if (index === 0) return
    setQueue((q) => {
      const next = [...q]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setQueue((q) => {
      if (index >= q.length - 1) return q
      const next = [...q]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (queue.length === 0) {
      setError('Agrega al menos un archivo.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    const finalFilename = computeOutputFilename(outputName)

    const formData = new FormData()
    formData.append('enumerate', enumerate ? '1' : '0')
    formData.append('output_name', finalFilename)
    for (const entry of queue) {
      formData.append('files', entry.file)
    }

    // 5-minute timeout — same as the original merge.html
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)

    try {
      const res = await fetch(`${import.meta.env.VITE_FLASK_URL}/flask/merge/merge`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || `Error ${res.status}`)
      }

      const blob = await res.blob()
      const filename = filenameFromDisposition(
        res.headers.get('Content-Disposition'),
        finalFilename,
      )
      triggerDownload(blob, filename)
      setSuccessMsg('Descarga iniciada.')
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        setError('La solicitud tardó demasiado. Prueba con menos archivos o solo PDFs.')
      } else {
        setError(err instanceof Error ? err.message : 'Error desconocido.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Combinar PDF</h1>

      <form className="card" onSubmit={handleSubmit}>

        {/* Drop zone */}
        <div className={m.field}>
          <span className={m.label}>Archivos</span>
          <div
            className={`${m.dropZone} ${dragging ? m.dropZoneOver : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => pickerRef.current?.click()}
          >
            <div className={m.dropPrompt}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <span>
                {queue.length === 0
                  ? <><u>Elige uno o más archivos</u> o arrástralos aquí</>
                  : <><u>Agregar más archivos</u> o arrástralos aquí</>}
              </span>
              <span className={m.dropHint}>.pdf, .docx</span>
            </div>
          </div>
          <input
            ref={pickerRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            className={m.hiddenInput}
            onChange={(e) => { addFiles(e.target.files); if (pickerRef.current) pickerRef.current.value = '' }}
          />
        </div>

        {/* File list */}
        {queue.length > 0 && (
          <ul className={m.fileList}>
            {queue.map((entry, index) => (
              <li key={entry.id} className={m.fileItem}>
                <span className={m.fileNum}>{index + 1}.</span>
                <span className={m.fileBadge} data-ext={ext(entry.file.name)}>
                  {ext(entry.file.name)}
                </span>
                <span className={m.fileName} title={entry.file.name}>
                  {entry.file.name}
                </span>
                <div className={m.fileActions}>
                  <button
                    type="button"
                    className={m.moveBtn}
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    aria-label="Subir"
                  >↑</button>
                  <button
                    type="button"
                    className={m.moveBtn}
                    onClick={() => moveDown(index)}
                    disabled={index === queue.length - 1}
                    aria-label="Bajar"
                  >↓</button>
                  <button
                    type="button"
                    className={m.removeBtn}
                    onClick={() => removeEntry(entry.id)}
                    aria-label="Eliminar"
                  >Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Options */}
        <div className={m.field}>
          <span className={m.label}>Opciones</span>
          <label className={m.checkRow}>
            <input
              type="checkbox"
              className={m.checkbox}
              checked={enumerate}
              onChange={(e) => setEnumerate(e.target.checked)}
            />
            Agregar numeración de páginas (Pag. n/total)
          </label>
        </div>

        <div className={m.field}>
          <label className={m.label} htmlFor="output-name">Nombre del archivo</label>
          <input
            id="output-name"
            className="form-input"
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="Nombre del archivo (opcional)"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className={m.loadingRow}>
            <span className={m.spinner} />
            Combinando… (los archivos Word pueden tardar un momento)
          </div>
        )}

        {/* Messages */}
        {error && <p className={m.msgErr}>{error}</p>}
        {successMsg && !error && <p className={m.msgOk}>{successMsg}</p>}

        <div className={styles.actions}>
          <button
            className="btn-primary"
            type="submit"
            disabled={queue.length === 0 || loading}
          >
            {loading ? 'Combinando…' : 'Combinar y descargar'}
          </button>
        </div>
      </form>
    </div>
  )
}
