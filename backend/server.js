import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const app = express()
const PORT = process.env.PORT || 3001
const EMAIL_TO = 'diego1992aguirre@gmail.com'
const TIMEZONE = 'America/Mexico_City'

const getResend = () => new Resend(process.env.RESEND_API_KEY)

const getTransporter = () => nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

let _supabase = null
function getSupabase() {
  if (!_supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env')
    }
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  }
  return _supabase
}

const upload = multer({ storage: multer.memoryStorage() })

const FRONTEND_URL = process.env.FRONTEND_URL
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (origin.startsWith('http://localhost')) return callback(null, true)
    if (FRONTEND_URL && origin === FRONTEND_URL) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
}))
app.use(express.json())

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDisplayName(email) {
  if (!email) return ''
  const local = email.split('@')[0]
  return local.split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatLocalDateForICS(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

function formatUtcDateForICS(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'express' })
})

// ─── Mail ────────────────────────────────────────────────────────────────────

app.post('/api/mail/send', upload.single('pdf'), async (req, res) => {
  console.log('POST /api/mail/send called, EMAIL_USER:', process.env.EMAIL_USER ? 'set' : 'missing')
  try {
    const { subject, date, time, message: customMessage, recipients, sender_email } = req.body
    const file = req.file

    if (!subject || !date || !time || !file) {
      return res.status(400).json({ error: 'subject, date, time and pdf file are required.' })
    }
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ error: 'EMAIL_USER and EMAIL_PASS are not configured on the server.' })
    }

    // Date/time formatting
    const startLocal = new Date(`${date}T${time}:00`)
    const endLocal = new Date(startLocal.getTime() + 60 * 60 * 1000)

    const monthsEs = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    const daysEs = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
    const monthName = monthsEs[startLocal.getMonth()] ?? ''
    const weekdayName = daysEs[startLocal.getDay()] ?? ''
    const longDateEs = `${weekdayName} ${startLocal.getDate()} de ${monthName} de ${startLocal.getFullYear()}`

    const [hourStr = '0', minuteStr = '00'] = time.split(':')
    let hourNum = Number(hourStr)
    if (Number.isNaN(hourNum)) hourNum = 0
    const isPM = hourNum >= 12
    let hour12 = hourNum % 12
    if (hour12 === 0) hour12 = 12
    const formattedTime = `${hour12}:${minuteStr} ${isPM ? 'p.m.' : 'a.m.'}`

    // iCal timestamps
    const dtStartLocal = formatLocalDateForICS(startLocal)
    const dtEndLocal = formatLocalDateForICS(endLocal)
    const dtStamp = formatUtcDateForICS(new Date())
    const uid = `${Date.now()}@verum-mail`

    const fullTitle = `Comité de Calificación - ${subject}`
    const trimmedCustom = customMessage && String(customMessage).trim()

    // Teams link from Supabase
    const { data: configRow } = await getSupabase()
      .from('config')
      .select('value')
      .eq('key', 'meeting_link')
      .single()
    const meetingLink = configRow?.value ?? 'https://teams.live.com/meet/9330207434019?p=11pDHEIX4Cep47Qc3Z'

    // Email body (text + HTML)
    const baseText =
      'Estimados miembros del comité\n\n' +
      `Los estamos convocando el próximo ${longDateEs}, a las ${formattedTime} ` +
      `con la finalidad de revisar la calificación de ${subject}.`
    const customBlock = trimmedCustom ? `\n\n${String(trimmedCustom)}` : ''
    const teamsText = `\n\nReunión de Microsoft Teams\nUnirse: ${meetingLink}\nSaludos,`
    const textForEmail = `${baseText}${customBlock}${teamsText}`

    const baseHtml =
      '<p>Estimados miembros del comité</p>' +
      `<p>Los estamos convocando el próximo <strong>${longDateEs}</strong>, a las <strong>${formattedTime}</strong> ` +
      `con la finalidad de revisar la calificación de ${subject}.</p>`
    const customHtml = trimmedCustom
      ? `<p>${String(trimmedCustom).replace(/\n/g, '<br />')}</p>`
      : ''
    const teamsHtml =
      `<p style="font-size:15pt;font-weight:bold;">Reunión de Microsoft Teams<br />` +
      `<a href="${meetingLink}">Unirse a la reunión</a></p>` +
      `<p>Saludos,<br/><strong>${getDisplayName(sender_email)}</strong></p>`
    const htmlForEmail = `${baseHtml}${customHtml}${teamsHtml}`

    // Recipients
    let toList = []
    if (typeof recipients === 'string') {
      try {
        const parsed = JSON.parse(recipients)
        if (Array.isArray(parsed)) toList = parsed.filter((v) => typeof v === 'string')
      } catch { /* ignore */ }
    } else if (Array.isArray(recipients)) {
      toList = recipients.filter((v) => typeof v === 'string')
    }
    if (toList.length === 0) toList = [EMAIL_TO]

    // iCal content (exact format from old project)
    const icsContent = [
      'BEGIN:VCALENDAR',
      'PRODID:-//Verum Mail//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;TZID=${TIMEZONE}:${dtStartLocal}`,
      `DTEND;TZID=${TIMEZONE}:${dtEndLocal}`,
      `SUMMARY:${fullTitle}`,
      `DESCRIPTION:${textForEmail.replace(/\n/g, '\\n')}`,
      'ORGANIZER;CN=Verum Committee:mailto:onboarding@resend.dev',
      `ATTENDEE;CN=Diego Aguirre;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${EMAIL_TO}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')

    const transporter = getTransporter()
    try {
      const info = await transporter.sendMail({
        from: `PCR Verum <${process.env.EMAIL_USER}>`,
        to: toList,
        replyTo: sender_email || undefined,
        subject: fullTitle,
        html: htmlForEmail,
        attachments: [
          {
            filename: file.originalname,
            content: file.buffer,
          },
          {
            filename: 'invitacion.ics',
            content: Buffer.from(icsContent),
            contentType: 'text/calendar;method=REQUEST',
            contentDisposition: 'inline',
          },
        ],
      })
      console.log('Email sent successfully:', info.messageId)
    } catch (err) {
      console.error('Nodemailer error:', err.message)
      console.error('Nodemailer error code:', err.code)
      console.error('Nodemailer error response:', err.response)
      throw err
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('Error sending email:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send email.' })
  }
})

// ─── Recipients ──────────────────────────────────────────────────────────────

app.get('/api/mail/recipients', async (_req, res) => {
  const { data, error } = await getSupabase().from('recipients').select('*').order('created_at')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.post('/api/mail/recipients', async (req, res) => {
  const { email, name } = req.body
  if (!email) return res.status(400).json({ error: 'email is required' })
  const row = { email, ...(name ? { name } : {}) }
  const { data, error } = await getSupabase().from('recipients').insert(row).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

app.delete('/api/mail/recipients/:id', async (req, res) => {
  const { error } = await getSupabase().from('recipients').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Calificación recipients ──────────────────────────────────────────────────
// NOTE: Create table `recipients_calificacion` in Supabase with the same schema
// as the `recipients` table: id (uuid, pk), email (text, not null),
// name (text, not null), created_at (timestamptz, default now()).

app.get('/api/calificacion/recipients', async (_req, res) => {
  const { data, error } = await getSupabase()
    .from('recipients_calificacion')
    .select('*')
    .order('created_at')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.post('/api/calificacion/recipients', async (req, res) => {
  const { email, name } = req.body
  if (!email) return res.status(400).json({ error: 'email is required' })
  const row = { email, ...(name ? { name } : {}) }
  const { data, error } = await getSupabase()
    .from('recipients_calificacion')
    .insert(row)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

app.delete('/api/calificacion/recipients/:id', async (req, res) => {
  const { error } = await getSupabase()
    .from('recipients_calificacion')
    .delete()
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).end()
})

// ─── Comunicado send ─────────────────────────────────────────────────────────
// Calls Flask /flask/comunicado/process twice (DOCX + PDF), then emails results
// to all recipients in the recipients_calificacion table.
// Requires FLASK_URL env var (e.g. http://flask.railway.internal:5000 on Railway,
// http://localhost:5000 for local dev).

app.post('/api/comunicado/send', upload.single('file'), async (req, res) => {
  try {
    const { empresa, output_name, mensaje, sender_email } = req.body
    const file = req.file

    if (!file) return res.status(400).json({ error: 'file (.docx) is required.' })
    if (!empresa?.trim()) return res.status(400).json({ error: 'empresa is required.' })
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server.' })
    }

    const FLASK_URL = process.env.FLASK_URL || 'http://localhost:5000'
    const baseName = output_name?.trim() || 'ComPrensa_'
    const trimmedMensaje = mensaje ? String(mensaje).trim() : ''

    // Helper — build a FormData to POST to Flask
    function makeFlaskForm(plain, pdf) {
      const fd = new FormData()
      const blob = new Blob([file.buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      fd.append('file', blob, file.originalname)
      fd.append('plain', plain ? 'true' : 'false')
      fd.append('pdf', pdf ? 'true' : 'false')
      return fd
    }

    // 1) Versión lisa DOCX (plain=true, pdf=false)
    const flaskDocxRes = await fetch(`${FLASK_URL}/flask/comunicado/process`, {
      method: 'POST',
      body: makeFlaskForm(true, false),
    })
    if (!flaskDocxRes.ok) {
      const d = await flaskDocxRes.json().catch(() => ({}))
      throw new Error(d.error || `Flask DOCX error ${flaskDocxRes.status}`)
    }
    const docxBuffer = Buffer.from(await flaskDocxRes.arrayBuffer())

    // 2) PDF from original (plain=false, pdf=true)
    const flaskPdfRes = await fetch(`${FLASK_URL}/flask/comunicado/process`, {
      method: 'POST',
      body: makeFlaskForm(false, true),
    })
    if (!flaskPdfRes.ok) {
      const d = await flaskPdfRes.json().catch(() => ({}))
      throw new Error(d.error || `Flask PDF error ${flaskPdfRes.status}`)
    }
    const pdfBuffer = Buffer.from(await flaskPdfRes.arrayBuffer())

    // 3) Fetch calificacion recipients
    const { data: recipientsData, error: recipientsError } = await getSupabase()
      .from('recipients_calificacion')
      .select('email')
    let toList = []
    if (!recipientsError && Array.isArray(recipientsData) && recipientsData.length > 0) {
      toList = recipientsData.map((r) => r.email)
    }
    if (toList.length === 0) toList = [EMAIL_TO]

    // 4) Build email
    const emailSubject = `Comunicado de Prensa – ${empresa.trim()} (${baseName})`
    const mensajeHtml = trimmedMensaje
      ? `<p>${trimmedMensaje.replace(/\n/g, '<br />')}</p>`
      : ''
    const htmlBody =
      '<p>Estimado equipo de publicación, espero se encuentren bien.</p>' +
      `<p>Les comparto el comunicado de prensa de la calificación de <strong>${empresa.trim()}</strong> (${baseName}), ` +
      'pidiéndoles me apoyen con su publicación en nuestra página de Internet.</p>' +
      mensajeHtml +
      '<p>Cualquier tema, estamos a sus órdenes.</p>' +
      '<p>Muchas gracias por su apoyo.</p>' +
      `<p>Saludos!<br/><strong>${getDisplayName(sender_email)}</strong></p>`

    // 5) Send via Resend — three attachments: original DOCX, lisa DOCX, PDF
    const resend = getResend()
    const { data, error: sendError } = await resend.emails.send({
      from: 'PCR Verum <contacto@verum.mx>',
      to: toList,
      replyTo: sender_email || undefined,
      subject: emailSubject,
      html: htmlBody,
      attachments: [
        {
          filename: file.originalname,
          content: file.buffer.toString('base64'),
        },
        {
          filename: `${baseName}.docx`,
          content: docxBuffer.toString('base64'),
        },
        {
          filename: `${baseName}.pdf`,
          content: pdfBuffer.toString('base64'),
        },
      ],
    })

    console.log('Resend comunicado response:', JSON.stringify(data, null, 2))
    if (sendError) {
      return res.status(500).json({ error: sendError.message ?? JSON.stringify(sendError) })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('Error sending comunicado:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to send comunicado.',
    })
  }
})

// ─── Reporte send ────────────────────────────────────────────────────────────
// Emails the uploaded PDF directly (no Flask processing needed) to all
// recipients in the recipients_calificacion table.

app.post('/api/reporte/send', upload.single('file'), async (req, res) => {
  try {
    const { empresa, mensaje, sender_email } = req.body
    const file = req.file

    if (!file) return res.status(400).json({ error: 'file (.pdf) is required.' })
    if (!empresa?.trim()) return res.status(400).json({ error: 'empresa is required.' })
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server.' })
    }

    const trimmedMensaje = mensaje ? String(mensaje).trim() : ''

    // Fetch calificacion recipients
    const { data: recipientsData, error: recipientsError } = await getSupabase()
      .from('recipients_calificacion')
      .select('email')
    let toList = []
    if (!recipientsError && Array.isArray(recipientsData) && recipientsData.length > 0) {
      toList = recipientsData.map((r) => r.email)
    }
    if (toList.length === 0) toList = [EMAIL_TO]

    // Build email
    const emailSubject = `Reporte de Calificación – ${empresa.trim()}`
    const mensajeHtml = trimmedMensaje
      ? `<p>${trimmedMensaje.replace(/\n/g, '<br />')}</p>`
      : ''
    const htmlBody =
      '<p>Estimado equipo de publicación, espero se encuentren bien.</p>' +
      `<p>Les comparto el reporte de calificación de <strong>${empresa.trim()}</strong>, ` +
      'pidiéndoles me apoyen con su publicación en nuestra página de Internet.</p>' +
      mensajeHtml +
      '<p>Cualquier duda o comentario, estoy a sus órdenes.</p>' +
      '<p>Muchas gracias por su apoyo.</p>' +
      `<p>Saludos!<br/><strong>${getDisplayName(sender_email)}</strong></p>`

    const resend = getResend()
    const { data, error: sendError } = await resend.emails.send({
      from: 'PCR Verum <contacto@verum.mx>',
      to: toList,
      replyTo: sender_email || undefined,
      subject: emailSubject,
      html: htmlBody,
      attachments: [
        {
          filename: file.originalname,
          content: file.buffer.toString('base64'),
        },
      ],
    })

    console.log('Resend reporte response:', JSON.stringify(data, null, 2))
    if (sendError) {
      return res.status(500).json({ error: sendError.message ?? JSON.stringify(sendError) })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('Error sending reporte:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to send reporte.',
    })
  }
})

// ─── Config (Teams meeting link) ─────────────────────────────────────────────

app.get('/api/mail/config', async (_req, res) => {
  const { data, error } = await getSupabase()
    .from('config')
    .select('value')
    .eq('key', 'meeting_link')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ meeting_link: data?.value ?? '' })
})

app.put('/api/mail/config', async (req, res) => {
  console.log('PUT /api/mail/config req.body:', JSON.stringify(req.body, null, 2))
  const { meeting_link } = req.body
  if (!meeting_link) return res.status(400).json({ error: 'meeting_link is required' })
  const { data, error } = await getSupabase()
    .from('config')
    .upsert({ key: 'meeting_link', value: meeting_link }, { onConflict: 'key' })
  console.log('Supabase upsert data:', JSON.stringify(data, null, 2))
  console.log('Supabase upsert error:', JSON.stringify(error, null, 2))
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`)
})
