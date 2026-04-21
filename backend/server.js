import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const app = express()
const PORT = process.env.PORT || 3001
const EMAIL_TO = 'diego1992aguirre@gmail.com'
const TIMEZONE = 'America/Mexico_City'

const getResend = () => new Resend(process.env.RESEND_API_KEY)

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
  try {
    const { subject, date, time, message: customMessage, recipients } = req.body
    const file = req.file

    if (!subject || !date || !time || !file) {
      return res.status(400).json({ error: 'subject, date, time and pdf file are required.' })
    }
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server.' })
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
      `Unirse: <a href="${meetingLink}">${meetingLink}</a></p>` +
      '<p>Saludos,</p>'
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

    const resend = getResend()
    const { data, error: sendError } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: toList,
      subject: fullTitle,
      html: htmlForEmail,
      attachments: [
        {
          filename: file.originalname,
          content: file.buffer.toString('base64'),
        },
        {
          filename: 'invite.ics',
          content: Buffer.from(icsContent).toString('base64'),
        },
      ],
    })

    console.log('Resend response:', JSON.stringify(data, null, 2))
    console.log('Resend error:', JSON.stringify(sendError, null, 2))

    if (sendError) {
      return res.status(500).json({ error: sendError.message ?? JSON.stringify(sendError) })
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
  const { meeting_link } = req.body
  if (!meeting_link) return res.status(400).json({ error: 'meeting_link is required' })
  const { error } = await getSupabase()
    .from('config')
    .upsert({ key: 'meeting_link', value: meeting_link }, { onConflict: 'key' })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`)
})
