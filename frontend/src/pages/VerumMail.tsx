import { useEffect, useRef, useState } from 'react'
import styles from './Page.module.css'
import m from './VerumMail.module.css'
import { useAuth } from '../lib/AuthContext'

// ─── Filename parsing (copied verbatim from Verum-Mail/src/App.tsx) ──────────

function subjectFromFilename(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '')
  const idx = base.indexOf('_')
  if (idx === -1) return base.trim()
  return base.slice(0, idx).trim()
}

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, sep: 9, oct: 10, nov: 11, dic: 12, dec: 12,
}

function dateFromFilename(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '')
  // DD.Mon.YYYY (e.g. 25.Oct.2019)
  const ddm = base.match(
    /(\d{1,2})\.(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic|Jan|Apr|Aug|Dec)\.(\d{4})/i,
  )
  if (ddm) {
    const day = parseInt(ddm[1], 10)
    const month = MONTHS[ddm[2].toLowerCase().slice(0, 3)]
    const year = parseInt(ddm[3], 10)
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  // Mon.DD.YYYY (e.g. Feb.23.2026)
  const mdy = base.match(
    /(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic|Jan|Apr|Aug|Dec)\.(\d{1,2})\.(\d{4})/i,
  )
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase().slice(0, 3)]
    const day = parseInt(mdy[2], 10)
    const year = parseInt(mdy[3], 10)
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return ''
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Recipient = { id: string; email: string; name?: string }
type View = 'enviar' | 'gestionar'

// ─── Component ───────────────────────────────────────────────────────────────

export default function VerumMail() {
  const user = useAuth()
  const [view, setView] = useState<View>('enviar')

  // Enviar state
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [subject, setSubject] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Gestionar state
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [recipientStatus, setRecipientStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [meetingLink, setMeetingLink] = useState('')
  const [editedLink, setEditedLink] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)
  const [linkStatus, setLinkStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Load recipients + meeting link on mount
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/mail/recipients`)
      .then((r) => r.json())
      .then((data: Recipient[]) => setRecipients(Array.isArray(data) ? data : []))
      .catch(() => {})

    fetch(`${import.meta.env.VITE_API_URL}/api/mail/config`)
      .then((r) => r.json())
      .then((data: { meeting_link: string }) => {
        if (data?.meeting_link) {
          setMeetingLink(data.meeting_link)
          setEditedLink(data.meeting_link)
        }
      })
      .catch(() => {})
  }, [])

  // ── File handling ───────────────────────────────────────────────────────────

  function applyFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) return
    setPdfFile(file)
    const parsedSubject = subjectFromFilename(file.name)
    const parsedDate = dateFromFilename(file.name)
    if (parsedSubject) setSubject(parsedSubject)
    if (parsedDate) setDate(parsedDate)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) applyFile(file)
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
    const file = e.dataTransfer.files?.[0]
    if (file) applyFile(file)
  }

  function clearFile() {
    setPdfFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Send email ──────────────────────────────────────────────────────────────

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !date || !time || !pdfFile) {
      setSendStatus({ type: 'err', text: 'Completa todos los campos y adjunta un PDF.' })
      return
    }
    setSending(true)
    setSendStatus(null)
    try {
      const formData = new FormData()
      formData.append('subject', subject.trim())
      formData.append('date', date)
      formData.append('time', time)
      formData.append('message', message.trim())
      formData.append('pdf', pdfFile)
      formData.append('recipients', JSON.stringify(recipients.map((r) => r.email)))
      formData.append('sender_email', user?.email || '')

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/mail/send`, { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.success) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'No se pudo enviar el correo.',
        )
      }

      setSendStatus({ type: 'ok', text: 'Correo enviado correctamente.' })
      setSubject('')
      setDate('')
      setTime('')
      setMessage('')
      setPdfFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setSendStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo enviar el correo.',
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
    setRecipientStatus(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/mail/recipients`, {
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
      await fetch(`${import.meta.env.VITE_API_URL}/api/mail/recipients/${id}`, { method: 'DELETE' })
      setRecipients((prev) => prev.filter((r) => r.id !== id))
    } catch {
      // silently ignore — UI already optimistic-updates on success
    }
  }

  // ── Meeting link ────────────────────────────────────────────────────────────

  async function handleSaveLink() {
    const trimmed = editedLink.trim()
    if (!trimmed || trimmed === meetingLink) return
    setLinkSaving(true)
    setLinkStatus(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/mail/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_link: trimmed }),
      })
      if (!res.ok) throw new Error('Error al guardar.')
      setMeetingLink(trimmed)
      setLinkStatus({ type: 'ok', text: 'Liga actualizada correctamente.' })
      setTimeout(() => setLinkStatus(null), 2500)
    } catch (err) {
      setLinkStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error al guardar.',
      })
    } finally {
      setLinkSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Convocar Comité</h1>

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
            <label className={m.label}>Adjunto PDF</label>
            <div
              className={`${m.dropZone} ${dragging ? m.dropZoneOver : ''} ${pdfFile ? m.dropZoneHasFile : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !pdfFile && fileInputRef.current?.click()}
            >
              {pdfFile ? (
                <div className={m.fileRow}>
                  <span className={m.fileName}>{pdfFile.name}</span>
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
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                  <span>Arrastra un PDF aquí o <u>haz clic para seleccionar</u></span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              name="pdf"
              accept="application/pdf,.pdf"
              className={m.hiddenInput}
              onChange={handleFileInputChange}
            />
          </div>

          {/* Emisor */}
          <div className={m.field}>
            <label className={m.label}>Emisor</label>
            <input
              className="form-input"
              type="text"
              placeholder="Nombre del emisor"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          {/* Fecha y hora */}
          <div className={m.fieldRow}>
            <div className={m.field}>
              <label className={m.label}>Fecha</label>
              <input
                className="form-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className={m.field}>
              <label className={m.label}>Hora</label>
              <input
                className="form-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Mensaje personalizado */}
          <div className={m.field}>
            <label className={m.label}>Mensaje (opcional)</label>
            <textarea
              className={m.textarea}
              placeholder="Déjalo vacío para usar el mensaje predeterminado del comité, o escribe tu propio texto."
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {sendStatus && (
            <p className={sendStatus.type === 'ok' ? m.msgOk : m.msgErr}>{sendStatus.text}</p>
          )}

          <div className={styles.actions}>
            <button className="btn-primary" type="submit" disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar correo'}
            </button>
          </div>
        </form>
      )}

      {/* ── Gestionar ── */}
      {view === 'gestionar' && (
        <div className="card">

          {/* Add recipient */}
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

          {/* Recipient list */}
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

          <hr className={m.divider} />

          {/* Meeting link */}
          <div className={m.section}>
            <p className={m.sectionTitle}>Liga de reunión (Teams)</p>
            <div className={m.inlineRow}>
              <input
                className="form-input"
                type="url"
                placeholder="https://teams.live.com/meet/..."
                value={editedLink}
                onChange={(e) => { setEditedLink(e.target.value); setLinkStatus(null) }}
              />
              <button
                className="btn-primary"
                type="button"
                onClick={handleSaveLink}
                disabled={linkSaving || !editedLink.trim() || editedLink.trim() === meetingLink}
              >
                {linkSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {linkStatus && (
              <p className={linkStatus.type === 'ok' ? m.msgOk : m.msgErr}>{linkStatus.text}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
