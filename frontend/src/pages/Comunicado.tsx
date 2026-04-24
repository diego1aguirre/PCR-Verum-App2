import { useEffect, useRef, useState } from 'react'
import styles from './Page.module.css'
import m from './Comunicado.module.css'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function empresaFromFilename(filename: string): string {
  const base = filename.replace(/\.docx$/i, '')
  const idx = base.indexOf('_')
  return idx >= 0 ? base.slice(0, idx).trim() : base.trim()
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Recipient = { id: string; email: string; name?: string }
type View = 'enviar' | 'gestionar'

// ─── Component ───────────────────────────────────────────────────────────────

export default function Comunicado() {
  const [view, setView] = useState<View>('enviar')

  // ── Enviar state ────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const [outputName, setOutputName] = useState('ComPrensa_')
  const [mensaje, setMensaje] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Gestionar state ─────────────────────────────────────────────────────────
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [recipientStatus, setRecipientStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Load recipients on mount
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/calificacion/recipients`)
      .then((r) => r.json())
      .then((data: Recipient[]) => setRecipients(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // ── File handling ───────────────────────────────────────────────────────────

  function applyFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.docx')) {
      setSendStatus({ type: 'err', text: 'Solo se aceptan archivos .docx' })
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
      setSendStatus({ type: 'err', text: 'Adjunta un archivo .docx' })
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
      formData.append('output_name', outputName.trim() || 'ComPrensa_')
      formData.append('mensaje', mensaje.trim())

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/comunicado/send`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !(data as { success?: boolean }).success) {
        throw new Error(
          typeof (data as { error?: string }).error === 'string'
            ? (data as { error: string }).error
            : 'No se pudo enviar el comunicado.',
        )
      }

      setSendStatus({ type: 'ok', text: 'Comunicado enviado correctamente.' })
      setFile(null)
      setEmpresa('')
      setOutputName('ComPrensa_')
      setMensaje('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setSendStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo enviar el comunicado.',
      })
    } finally {
      setSending(false)
    }
  }

  // ── Recipients ──────────────────────────────────────────────────────────────

  async function handleAddRecipient() {
    const trimmedEmail = newEmail.trim()
    const trimmedName = newName.trim()
    if (!trimmedEmail) return
    if (recipients.some((r) => r.email === trimmedEmail)) {
      setNewEmail('')
      setNewName('')
      return
    }
    setRecipientStatus(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/calificacion/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail }),
      })
      const data: Recipient = await res.json()
      if (!res.ok) throw new Error((data as unknown as { error: string }).error)
      setRecipients((prev) => [...prev, data])
      setNewName('')
      setNewEmail('')
    } catch (err) {
      setRecipientStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error al agregar destinatario.',
      })
    }
  }

  async function handleRemoveRecipient(id: string) {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/calificacion/recipients/${id}`, {
        method: 'DELETE',
      })
      setRecipients((prev) => prev.filter((r) => r.id !== id))
    } catch { /* silently ignore */ }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Comunicado</h1>

      {/* Tabs */}
      <div className={m.tabs}>
        <button
          type="button"
          className={`${m.tab} ${view === 'enviar' ? m.tabActive : ''}`}
          onClick={() => setView('enviar')}
        >
          Enviar
        </button>
        <button
          type="button"
          className={`${m.tab} ${view === 'gestionar' ? m.tabActive : ''}`}
          onClick={() => setView('gestionar')}
        >
          Gestionar
        </button>
      </div>

      {/* ── Enviar ── */}
      {view === 'enviar' && (
        <form className="card" onSubmit={handleSend}>

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
                  <span className={m.dropHint}>.docx — máximo 50 MB</span>
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

          {/* Output filename */}
          <div className={m.field}>
            <label className={m.label} htmlFor="output-name">Nombre del archivo de salida</label>
            <input
              id="output-name"
              className="form-input"
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="ComPrensa_"
              autoComplete="off"
              onFocus={(e) => {
                const len = e.target.value.length
                e.target.setSelectionRange(len, len)
              }}
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
              Procesando y enviando comunicado…
            </div>
          )}

          {/* Status */}
          {sendStatus && (
            <p className={sendStatus.type === 'ok' ? m.msgOk : m.msgErr}>{sendStatus.text}</p>
          )}

          <div className={styles.actions}>
            <button className="btn-primary" type="submit" disabled={!file || sending}>
              {sending ? 'Enviando…' : 'Enviar comunicado'}
            </button>
          </div>
        </form>
      )}

      {/* ── Gestionar ── */}
      {view === 'gestionar' && (
        <div className="card">
          <div className={m.section}>
            <p className={m.sectionTitle}>Destinatarios</p>
            <div className={m.inlineRow}>
              <input
                className="form-input"
                type="text"
                placeholder="Nombre"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRecipient())}
              />
              <input
                className="form-input"
                type="email"
                placeholder="ej. usuario@empresa.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRecipient())}
              />
              <button className="btn-primary" type="button" onClick={handleAddRecipient}>
                Agregar
              </button>
            </div>
            {recipientStatus && (
              <p className={recipientStatus.type === 'ok' ? m.msgOk : m.msgErr}>
                {recipientStatus.text}
              </p>
            )}
          </div>

          {recipients.length > 0 ? (
            <ul className={m.recipientList}>
              {recipients.map((r) => (
                <li key={r.id} className={m.recipientItem}>
                  <div className={m.recipientInfo}>
                    {r.name && <span className={m.recipientName}>{r.name}</span>}
                    <span className={m.recipientEmail}>{r.email}</span>
                  </div>
                  <button
                    type="button"
                    className={m.removeBtn}
                    onClick={() => handleRemoveRecipient(r.id)}
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={m.empty}>No hay destinatarios guardados.</p>
          )}
        </div>
      )}
    </div>
  )
}
