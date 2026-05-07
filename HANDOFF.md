# PCR Verum App — Handoff Documentation

> Internal web platform that consolidates email, document processing, and PDF utilities for PCR Verum employees (`@verum.mx`).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Local Development Setup](#5-local-development-setup)
6. [Environment Variables](#6-environment-variables)
7. [Deployment (Railway)](#7-deployment-railway)
8. [External Services](#8-external-services)
9. [Authentication](#9-authentication)
10. [The Six Tools](#10-the-six-tools)
11. [Common Operations](#11-common-operations)
12. [Pending Tasks & Known Issues](#12-pending-tasks--known-issues)
13. [Credentials Handoff](#13-credentials-handoff)
14. [Contact](#14-contact)

---

## 1. Overview

**PCR Verum App** is an internal web platform restricted to employees with `@verum.mx` email addresses. It unifies six tools previously spread across multiple projects into a single web application.

**Production URL:** `https://pcr-verum-app2-production.up.railway.app`

### What it does

- **Convocar Comité** — Sends rating committee meeting invitations with PDF attachments and auto-creates Google Calendar events
- **Comunicado** — Processes press release Word documents, generates a "clean" version and PDF, then emails all three files
- **Reporte** — Sends rating reports as PDF to the Calificación distribution list
- **Merge PDF** — Combines multiple PDF and DOCX files into a single PDF, with optional page numbering
- **Formateador** — Converts a Word document into a clean version, a PDF, or both
- **Configuración** — Placeholder page (not yet implemented)

---

## 2. Architecture

The application consists of **four independent services** deployed on Railway:

```
                                ┌──────────────────────┐
                                │   User's Browser     │
                                └──────────┬───────────┘
                                           │
                                           ▼
                                ┌──────────────────────┐
                                │      Frontend        │
                                │  React + Vite + TS   │
                                │   (nginx, port 80)   │
                                └──────────┬───────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          ▼                                 ▼
              ┌──────────────────────┐         ┌──────────────────────┐
              │      Backend         │         │        Flask         │
              │  Node.js + Express   │         │  Python + Flask      │
              │     (port 4000)      │         │    (port 5000)       │
              └──────┬───────┬───────┘         └──────────┬───────────┘
                     │       │                            │
            ┌────────┘       └────────┐                   │
            ▼                         ▼                   ▼
    ┌──────────────┐         ┌──────────────┐    ┌──────────────────┐
    │  Gmail API   │         │    Resend    │    │    Gotenberg     │
    │ (Convocar    │         │  (Comunicado │    │  (DOCX → PDF)    │
    │  Comité)     │         │   + Reporte) │    └──────────────────┘
    └──────────────┘         └──────────────┘

                          ┌──────────────────────┐
                          │      Supabase        │
                          │  (Auth + Database)   │
                          └──────────────────────┘
```

### Service responsibilities

| Service | Purpose |
|---------|---------|
| **Frontend** | React SPA serving the user interface |
| **Backend** | Express server handling email sending (Gmail API + Resend), Supabase queries, and acting as a proxy to Flask |
| **Flask** | Python service handling Word document processing and PDF merging |
| **Gotenberg** | Off-the-shelf Docker service that converts DOCX → PDF (replaces LibreOffice) |

### Why two backends?

The Word-to-PDF and document processing logic uses Python libraries (`python-docx`, `pypdf`, etc.) that have no good Node.js equivalents. Instead of porting these, we kept the Python service alongside the Node.js backend.

---

## 3. Tech Stack

### Frontend
- React 18
- Vite 5
- TypeScript
- TailwindCSS
- React Router
- Supabase JS client

### Backend (Node.js)
- Node.js 18+ (recommend upgrading to 20+)
- Express 5
- Nodemailer (SMTP/Gmail API)
- Resend SDK
- Multer (file uploads)
- Google APIs client
- Supabase JS client

### Flask
- Python 3.11
- Flask
- python-docx
- pypdf
- ReportLab
- Gunicorn
- Requests (for Gotenberg)

### Infrastructure
- **Hosting:** Railway (Hobby plan, $5/month)
- **Database & Auth:** Supabase
- **Email:** Resend (verum.mx domain) + Gmail API (calendar invites)
- **DOCX → PDF:** Gotenberg
- **Version control:** GitHub
- **Domain:** verum.mx (DNS managed externally)

---

## 4. Repository Structure

```
PCR-Verum-App2/
├── frontend/                    # React + Vite + TS
│   ├── src/
│   │   ├── pages/              # Page components (one per tool)
│   │   ├── components/         # Sidebar, shared UI
│   │   ├── lib/                # Supabase client, AuthContext
│   │   └── App.tsx             # Router and auth gate
│   ├── Dockerfile              # Multi-stage build (Vite → nginx)
│   ├── nginx.conf              # Static file server config
│   └── .env.local              # Local env vars (NOT committed)
│
├── backend/                     # Node.js + Express
│   ├── server.js               # Main server file with all routes
│   ├── routes/                 # Route modules (mail, comunicado, reporte)
│   ├── lib/                    # Supabase server client, helpers
│   ├── Dockerfile
│   └── .env                    # Local env vars (NOT committed)
│
├── flask/                       # Python + Flask
│   ├── app.py                  # Main Flask app
│   ├── comunicado_processor.py # DOCX cleaning logic
│   ├── add_page_numbers.py     # PDF header numbering
│   ├── pdf_pipeline.py         # PDF merging logic
│   ├── Dockerfile              # Includes LibreOffice + fonts
│   └── requirements.txt
│
├── HANDOFF.md                  # This file
└── README.md
```

---

## 5. Local Development Setup

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- Git
- Docker (optional, for local Gotenberg testing)

### Step 1: Clone the repo

```bash
git clone https://github.com/diego1aguirre/PCR-Verum-App2.git
cd PCR-Verum-App2
```

### Step 2: Set up environment variables

Create the following local env files (see [Environment Variables](#6-environment-variables) for the full list):

- `frontend/.env.local`
- `backend/.env`
- `flask/.env`

### Step 3: Install dependencies and run each service

**Frontend** (in one terminal):
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

**Backend** (in another terminal):
```bash
cd backend
npm install
npm start
# Runs on http://localhost:4000
```

**Flask** (in a third terminal):
```bash
cd flask
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
# Runs on http://localhost:5000
```

**Gotenberg** (Docker, optional for local DOCX→PDF testing):
```bash
docker run --rm -p 3000:3000 gotenberg/gotenberg:8
```

### Note for macOS users

If port 5000 is busy, it's likely **AirPlay Receiver**. Disable it in System Settings → General → AirDrop & Handoff, OR change the port in `flask/app.py`.

The Vite proxy in `frontend/vite.config.ts` uses `127.0.0.1:5000` (not `localhost`) to avoid IPv6 issues on macOS.

---

## 6. Environment Variables

### Frontend (`frontend/.env.local` for local, Railway BUILD ARGS for production)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public key |
| `VITE_API_URL` | Backend URL (must include `https://` or `http://`) |
| `VITE_FLASK_URL` | Flask service URL (must include `https://` or `http://`) |

> **CRITICAL:** Frontend env vars MUST be declared as `ARG` and `ENV` in `frontend/Dockerfile` because Vite bakes them into the JavaScript bundle at build time. Setting them as runtime env vars on Railway will NOT work — they must be added as **build variables** in Railway's service settings.

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | `4000` |
| `FRONTEND_URL` | Frontend URL for CORS (no trailing slash, exact match) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `RESEND_API_KEY` | Resend API key (starts with `re_`) |
| `EMAIL_USER` | Gmail SMTP user (legacy, kept for backwards compat) |
| `EMAIL_PASS` | Gmail App Password (legacy, kept for backwards compat) |
| `GMAIL_CLIENT_ID` | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Google OAuth refresh token |
| `GMAIL_USER` | Email account used to send invites (currently `diego.aguirre@verum.mx`, should be `contacto@verum.mx`) |
| `FLASK_URL` | URL of the Flask service |

### Flask (`flask/.env`)

| Variable | Description |
|----------|-------------|
| `GOTENBERG_URL` | URL of the Gotenberg service (e.g., `https://gotenberg-production-xxxx.up.railway.app`) |

---

## 7. Deployment (Railway)

The app uses **Railway** (Hobby plan, ~$5/month). Each service is a separate Railway service in the same project.

### Production services

| Service | URL |
|---------|-----|
| Frontend | `pcr-verum-app2-production.up.railway.app` |
| Backend | `backend-production-e80f8.up.railway.app` |
| Flask | `flask-production-9213.up.railway.app` |
| Gotenberg | `gotenberg-production-2ffa.up.railway.app` |

### How deployments work

1. Railway is connected to the GitHub repo (`diego1aguirre/PCR-Verum-App2`, branch `main`)
2. **Every push to `main` triggers automatic deploys** for all four services
3. Each service has its own root directory:
   - Frontend: `/frontend`
   - Backend: `/backend`
   - Flask: `/flask`
   - Gotenberg: uses the public Docker image `gotenberg/gotenberg:8`
4. Each service has its own Dockerfile (except Gotenberg)

### Adding/changing environment variables

1. Log into Railway → select project → click the service
2. Go to **Variables** tab
3. Add or edit variables
4. **For frontend:** add them as both **Variables** AND **Build Variables** (Vite needs them at build time)
5. Railway will redeploy automatically

### Viewing logs

Railway dashboard → service → **Deployments** tab → click any deployment → **View Logs**

### Manual redeploys

Railway dashboard → service → **Deployments** → click the **⋮** menu on the latest deployment → **Redeploy**

---

## 8. External Services

### 8.1 Supabase (Auth + Database)

- **Project URL:** `https://tvwyndmziihitlzleihb.supabase.co`
- **Used for:** User authentication, recipient lists, configuration storage

**Tables:**

| Table | Purpose |
|-------|---------|
| `recipients` | Comité distribution list (used by Convocar Comité) |
| `recipients_calificacion` | Calificación distribution list (shared by Comunicado + Reporte) |
| `config` | Key/value config (e.g., `meeting_link` for Teams URL) |

All tables have **RLS (Row Level Security)** enabled with anon SELECT/INSERT/DELETE/UPDATE policies (suitable since access is gated by `@verum.mx` email).

**Database trigger:** A trigger on `auth.users` automatically inserts new confirmed users into both recipient tables. The display name is derived from the email local part with title casing on dot-separated words (e.g., `diego.aguirre@verum.mx` → `Diego Aguirre`).

### 8.2 Resend (Email API)

- **Account:** verum.mx team account
- **Verified domain:** `verum.mx`
- **Used for:**
  - Sending Comunicado emails (from `contacto@verum.mx`)
  - Sending Reporte emails (from `contacto@verum.mx`)
  - Supabase Auth emails (sign-up confirmations, password resets) via SMTP

**Free tier:** 3,000 emails/month, 100/day. We're on the free tier.

**SMTP for Supabase:**
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: Resend API key
- Sender: `noreply@verum.mx`

This bypasses Supabase's default 2 emails/hour limit for auth emails.

### 8.3 Gmail API (Calendar invites)

- **Google Cloud project:** "PCR Verum"
- **Currently authorized account:** `diego.aguirre@verum.mx` (TEMPORARY — should be migrated to `contacto@verum.mx`)
- **Used for:** Convocar Comité only — auto-creates Google Calendar events for recipients via iCal `METHOD:REQUEST`

**Why Gmail API instead of SMTP?** Railway blocks outbound SMTP traffic, so direct SMTP sends from the backend fail. The Gmail API uses HTTPS and works reliably.

**OAuth setup:** OAuth 2.0 client with refresh token obtained via Google's OAuth Playground. The refresh token is stored as `GMAIL_REFRESH_TOKEN` in the backend env.

### 8.4 Gotenberg (DOCX → PDF)

- **Docker image:** `gotenberg/gotenberg:8`
- **Used for:** Converting Word documents to PDF in the Comunicado and Formateador tools
- **Why:** LibreOffice direct subprocess calls were unreliable on Railway. Gotenberg wraps LibreOffice in a stable HTTP API.

---

## 9. Authentication

### Sign-up flow

1. User goes to `/login`, switches to "Crear cuenta" mode
2. User enters their `@verum.mx` email and a password (frontend validates the domain silently)
3. Supabase creates a pending user and sends a branded confirmation email via Resend SMTP
4. User clicks the link in the email
5. Supabase confirms the user → triggers the `handle_new_user()` database trigger → user is auto-added to both recipient tables
6. User can now log in

### Login flow

1. User enters email + password
2. Supabase validates → returns a session
3. Frontend stores the session and shows the app

### Forgot password flow

1. User clicks "¿Olvidaste tu contraseña?" on login page
2. Enters email → Supabase sends a reset email (branded template via Resend SMTP)
3. User clicks the link → lands on `/reset-password` (a public route)
4. User enters new password + confirmation → `supabase.auth.updateUser({ password })` is called
5. On success, user is redirected to `/convocar-comite`

### Domain restriction

The `@verum.mx` restriction is enforced **on the frontend only**, in `frontend/src/pages/Login.tsx`. For additional security, a Supabase **Auth Hook** could be added to enforce this server-side (see [Pending Tasks](#12-pending-tasks--known-issues)).

### Email templates

Custom branded HTML templates are stored in **Supabase → Authentication → Email Templates**:
- **Confirm signup** — "Confirma tu cuenta"
- **Reset password** — "Restablece tu contraseña"

Both use the PCR Verum logo (`https://pcrverum.mx/wp-content/uploads/2021/08/logo.cliente.png`), the brand colors (#231F20, #F48220, #08A698), and orange CTA buttons.

---

## 10. The Six Tools

### 10.1 Convocar Comité (`/convocar-comite`)

Sends committee meeting invitations with auto-calendar events.

**Inputs:** PDF attachment, subject (emisor), date, time, optional message, recipients (from Supabase `recipients` table or manual entry)

**Endpoint:** `POST /api/mail/send`

**How it works:**
1. Frontend uploads PDF + form fields to backend (multipart)
2. Backend builds an iCal `METHOD:REQUEST` block (30-min meeting, `TZID=America/Mexico_City`)
3. Backend uses the **Gmail API** to send the email with the PDF attachment + iCal as `invite.ics` (Content-Class: `urn:content-classes:calendarmessage`)
4. Recipients see the email AND get the meeting auto-added to their Google Calendar
5. Sender display name is derived from the logged-in user's email (e.g., `diego.aguirre@verum.mx` → "Diego Aguirre"); Reply-To is set to the sender's actual email

### 10.2 Comunicado (`/comunicado`)

Processes a press release Word document and emails three files.

**Inputs:** DOCX file, output filename (auto-prefilled with `ComPrensa_`), recipients (from `recipients_calificacion`)

**Endpoint:** `POST /api/comunicado/send`

**How it works:**
1. Frontend uploads DOCX
2. Backend calls Flask `/flask/comunicado/process` twice:
   - First with `plain=true` (generates a "clean" version DOCX)
   - Second with `pdf=true` (generates PDF via Gotenberg)
3. Backend sends the email via Resend with three attachments:
   - Original DOCX
   - "Versión lisa" DOCX (clean version)
   - PDF
4. Subject: `Comunicado de Prensa – {empresa} ({output_name})`
5. Empresa name auto-extracted from the part before the first `_` in the filename

Has a **Gestionar tab** for managing the `recipients_calificacion` table (add/remove recipients).

### 10.3 Reporte (`/reporte`)

Sends a rating report PDF.

**Inputs:** PDF file, recipients (shared `recipients_calificacion` list — no Gestionar tab here)

**Endpoint:** `POST /api/reporte/send`

**How it works:** Sends via Resend with the PDF attached. Subject: `Reporte de Calificación – {empresa}`.

### 10.4 Merge PDF (`/merge-pdf`)

Combines multiple PDF and DOCX files into a single PDF.

**Inputs:** Multiple files (reorderable with ↑↓ buttons), optional "Pag. n/total" header numbering

**Endpoint:** `POST /flask/merge/merge`

**How it works:** Flask receives all files, converts any DOCX to PDF via Gotenberg, then concatenates them with `pypdf` and optionally adds page numbers via ReportLab.

### 10.5 Formateador (`/formateador`)

Converts a Word document to clean version + PDF.

**Inputs:** DOCX, output filename, two checkboxes (clean version, PDF)

**Endpoint:** `POST /flask/comunicado/process`

**How it works:** Same processing as Comunicado but returns the file(s) directly to the user as downloads instead of emailing.

### 10.6 Configuración (`/configuracion`)

Currently a **placeholder** with no functionality. Has only a "Nombre de usuario" field that doesn't do anything. Needs to be implemented or removed.

---

## 11. Common Operations

### Add a new user manually (without sign-up)

1. Supabase → **Authentication** → **Users** → **Invite user**
2. Enter the user's `@verum.mx` email
3. They will receive an invite email
4. Once they confirm, the trigger auto-adds them to recipient lists

### Add a recipient to a distribution list

Use the **Gestionar** tab inside Comunicado. Or directly via Supabase: **Table Editor** → `recipients` or `recipients_calificacion` → insert row.

### Update the Teams meeting link

Supabase → **Table Editor** → `config` table → update the row where `key = 'meeting_link'`.

### View email send logs

- Resend emails: `https://resend.com/emails`
- Gmail API emails: in the sender's Gmail "Sent" folder (currently `diego.aguirre@verum.mx`)

### Rotate Resend API key

1. Resend dashboard → **API Keys** → create new key, delete old one
2. Update `RESEND_API_KEY` in **Backend** Railway service variables
3. Update SMTP password in Supabase → Authentication → Email → SMTP settings

### Rotate Supabase anon key

1. Supabase → **Project Settings** → **API** → **Reset anon key**
2. Update `SUPABASE_ANON_KEY` in Backend Railway variables
3. Update `VITE_SUPABASE_ANON_KEY` in Frontend Railway **Build Variables** (must trigger redeploy)

### Switch the Gmail account used for Convocar Comité

(See [Pending Tasks](#12-pending-tasks--known-issues) — this needs to happen.)

1. Get IT to grant you access to `contacto@verum.mx`
2. Sign in to Google Cloud Console as `contacto@verum.mx`, ensure the "PCR Verum" OAuth client is accessible
3. Use Google OAuth Playground to obtain a new refresh token authorized for `contacto@verum.mx`
4. Update Backend Railway variables:
   - `GMAIL_USER=contacto@verum.mx`
   - `GMAIL_REFRESH_TOKEN=<new_token>`
5. Restart the Backend service

### Update verum.mx DNS records

verum.mx DNS is managed externally (likely by IT). For Resend domain verification, the SPF, DKIM, and DMARC records are already in place. If they need to be re-verified, log into Resend → **Domains** → `verum.mx` → check DNS records.

---

## 12. Pending Tasks & Known Issues

### Pending tasks

1. **Switch Gmail API account from `diego.aguirre@verum.mx` to `contacto@verum.mx`** — Currently using my personal verum email for testing. Once IT grants access to `contacto@verum.mx`, generate a new refresh token and swap the env vars.

2. **Implement the Configuración page** — Currently just a placeholder with a useless "Nombre de usuario" field. Decide what config options to expose (e.g., default sender name, default meeting link, etc.) or remove the page entirely.

3. **Server-side `@verum.mx` enforcement** — Domain restriction is currently frontend-only. Add a Supabase Auth Hook to reject sign-ups from non-`@verum.mx` emails server-side.

4. **Upgrade to Node.js 20+** — The Supabase client logs a warning about Node 18 deprecation. Update the `node` version in `backend/Dockerfile`.

### Known issues

1. **Word→PDF quality (~95%)** — Gotenberg/LibreOffice produces good-but-not-perfect PDFs from Word docs. Some edge cases:
   - The "Atlante" header text is missing on some PDFs because the Word template has it as plain text in a structure that LibreOffice doesn't fully reproduce — this is a template issue, not a code bug. **Fix:** edit the Word template to use a proper header field, or use a different conversion service.
   - Logo color shift in some PDFs: the logo in the Word template has a CMYK color profile, which causes a slight color shift when converted to PDF (which uses RGB). **Fix:** re-save the logo as sRGB PNG and replace it in the Word template.
   - **Alternatives if higher fidelity is needed:**
     - Microsoft Graph API (free if M365 already owned, requires Azure App Registration)
     - CloudConvert ($13/month for 1,000 conversions)
     - ConvertAPI ($9/month for 1,500 conversions)

2. **Railway blocks SMTP** — That's why we use the Gmail API instead of `nodemailer` direct SMTP. If you ever migrate hosting providers, you may be able to simplify the email code.

### Conventions to know if you're modifying the code

- **CORS strict equality:** The backend checks `FRONTEND_URL` with exact equality (no trailing slash). Make sure that env var matches the production URL exactly.
- **Vite env vars need both ARG and runtime variables in Dockerfile:** See `frontend/Dockerfile`. Adding a new `VITE_*` variable requires updating the Dockerfile too.
- **Flask routes need explicit `methods=['POST', 'OPTIONS']`:** The `@app.post()` shortcut doesn't register `OPTIONS`, which breaks CORS preflight in production. Use `@app.route(..., methods=['POST', 'OPTIONS'])` instead.
- **iCal time generation uses pure string parsing:** The backend builds `DTSTART`/`DTEND` from raw `YYYY-MM-DD` and `HH:MM` strings instead of constructing a `Date` object — this avoids timezone drift bugs.

---

## 13. Credentials Handoff

**DO NOT commit credentials to the repo or include them in this document.**

The following credentials need to be transferred securely (via 1Password, Bitwarden, or in-person session):

- Supabase project: ownership transfer or admin access
- Railway project: ownership transfer or admin access
- Resend account: admin access
- Google Cloud project ("PCR Verum"): ownership transfer or admin access
- GitHub repo (`diego1aguirre/PCR-Verum-App2`): ownership transfer
- All API keys and secrets currently set in Railway env vars
- Gmail OAuth refresh token (will need to be regenerated when switching accounts anyway)
- Domain DNS access for verum.mx (likely already with IT)

### Recommended handoff sequence

1. **Schedule a 60-minute screen-share session** with the IT team
2. **Walk through the app** — show each tool working end-to-end
3. **Transfer ownership of all external accounts** during the session (you sign in, add their email as admin, they confirm, you remove yourself if appropriate)
4. **Share env var values** via password manager or encrypted file (NOT email/Slack)
5. **Hand off the GitHub repo** by transferring ownership in repo Settings
6. **Confirm Railway auto-deploys still work** by making a test commit from their account

---

## 14. Contact

**Original developer:** Diego Aguirre (`diego.aguirre@verum.mx`)

For questions during the transition period, reach out via email or whatever channel the company prefers.

---

*Last updated: May 2026*
