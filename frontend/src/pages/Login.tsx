import { useState } from 'react'
import { supabase } from '../lib/supabase'
import m from './Login.module.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Domain restriction
    if (!email.trim().toLowerCase().endsWith('@verum.mx')) {
      setError('Solo se permiten correos @verum.mx')
      return
    }

    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw authError
      // Auth state change in App.tsx will redirect automatically
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Credenciales incorrectas. Inténtalo de nuevo.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={m.page}>
      <div className={m.card}>
        <div className={m.logoWrap}>
          <img
            src="https://pcrverum.mx/wp-content/uploads/2021/08/logo.cliente.png"
            alt="PCR Verum"
            className={m.logo}
          />
        </div>

        <form className={m.form} onSubmit={handleSubmit}>
          {error && <div className={m.error}>{error}</div>}

          <div className={m.field}>
            <label className={m.label} htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@verum.mx"
              autoComplete="email"
              autoFocus
              required
            />
          </div>

          <div className={m.field}>
            <label className={m.label} htmlFor="password">Contraseña</label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className={m.submitBtn}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className={m.hint}>Las cuentas son administradas internamente.</p>
      </div>
    </div>
  )
}
