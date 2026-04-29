import { useRef, useState } from 'react'
import styles from './Page.module.css'
import m from './Reporte.module.css'
import { useAuth } from '../lib/AuthContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function empresaFromFilename(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '')
  const idx = base.indexOf('_')
  return idx >= 0 ? base.slice(0, idx).trim() : base.trim()
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Reporte() {
  const user = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handling ───────────────────────────────────────────────────────────

  function applyFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setSendStatus({ type: 'err', text: 'Solo se aceptan archivos .pdf' })
      return
    }
    setFile(f)
    setSendStatus(null)
    const parsed = empresaFromFilename(f.name)
    if (parsed) setEmpresa(parsed)
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

  // ── Send ────────────────────────────────────────────────────────────────────

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setSendStatus({ type: 'err', text: 'Adjunta un archivo .pdf' })
      return
    }
    if (!empresa.trim()) {
      setSendStatus({ type: 'err', text: 'Escribe el nombre de la empresa.' })
      return
    }

    setSending(true)
    setSendStatus(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('empresa', empresa.trim())
      formData.append('mensaje', mensaje.trim())
      formData.append('sender_email', user?.email || '')

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/reporte/send`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !(data as { success?: boolean }).success) {
        throw new Error(
          typeof (data as { error?: string }).error === 'string'
            ? (data as { error: string }).error
            : 'No se pudo enviar el reporte.',
        )
      }

      setSendStatus({ type: 'ok', text: 'Reporte enviado correctamente.' })
      setFile(null)
      setEmpresa('')
      setMensaje('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setSendStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo enviar el reporte.',
      })
    } finally {
      setSending(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Reporte</h1>

      <form className="card" onSubmit={handleSend}>

        {/* Drop zone */}
        <div className={m.field}>
          <label className={m.label}>Archivo .pdf</label>
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
                <span className={m.dropHint}>.pdf — máximo 50 MB</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className={m.hiddenInput}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFile(f) }}
          />
        </div>

        {/* Empresa */}
        <div className={m.field}>
          <label className={m.label} htmlFor="empresa">Nombre de la empresa</label>
          <input
            id="empresa"
            className="form-input"
            type="text"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            placeholder="Nombre de la empresa"
            autoComplete="off"
            required
          />
        </div>

        {/* Mensaje adicional */}
        <div className={m.field}>
          <label className={m.label} htmlFor="mensaje">Mensaje adicional (opcional)</label>
          <textarea
            id="mensaje"
            className={m.textarea}
            placeholder="Escribe un mensaje adicional o déjalo vacío."
            rows={4}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
          />
        </div>

        {/* Loading */}
        {sending && (
          <div className={m.loadingRow}>
            <span className={m.spinner} />
            Enviando reporte…
          </div>
        )}

        {/* Status */}
        {sendStatus && (
          <p className={sendStatus.type === 'ok' ? m.msgOk : m.msgErr}>{sendStatus.text}</p>
        )}

        <div className={styles.actions}>
          <button className="btn-primary" type="submit" disabled={!file || sending}>
            {sending ? 'Enviando…' : 'Enviar reporte'}
          </button>
        </div>
      </form>
    </div>
  )
}
