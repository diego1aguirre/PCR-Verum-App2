import { useState } from 'react'
import { supabase } from '../lib/supabase'
import m from './Login.module.css'

type Mode = 'signin' | 'signup'

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSuccessMsg(null)
    setPassword('')
    setConfirm('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    // Domain restriction — enforced on both modes (error is intentionally generic)
    if (!email.trim().toLowerCase().endsWith('@verum.mx')) {
      setError(
        mode === 'signin'
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo crear la cuenta. Inténtalo de nuevo.',
      )
      return
    }

    if (mode === 'signup') {
      if (password !== confirm) {
        setError('Las contraseñas no coinciden.')
        return
      }
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'signin') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (authError) throw authError
        // onAuthStateChange in App.tsx handles the redirect
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (authError) throw authError
        setSuccessMsg('Revisa tu correo para confirmar tu cuenta.')
        setPassword('')
        setConfirm('')
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : mode === 'signin'
          ? 'Credenciales incorrectas. Inténtalo de nuevo.'
          : 'No se pudo crear la cuenta. Inténtalo de nuevo.',
      )
    } finally {
      setLoading(false)
    }
  }

  const isSignUp = mode === 'signup'

  return (
    <div className={m.page}>
      <div className={m.card}>
        {/* Logo */}
        <div className={m.logoWrap}>
          <img
            src="https://pcrverum.mx/wp-content/uploads/2021/08/logo.cliente.png"
            alt="PCR Verum"
            className={m.logo}
          />
        </div>

        {/* Mode title */}
        <h2 className={m.title}>
          {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
        </h2>

        <form className={m.form} onSubmit={handleSubmit}>
          {/* Error */}
          {error && <div className={m.error}>{error}</div>}

          {/* Success (sign-up confirmation) */}
          {successMsg && <div className={m.success}>{successMsg}</div>}

          {/* Email */}
          <div className={m.field}>
            <label className={m.label} htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico"
              autoComplete="email"
              autoFocus
              required
            />
          </div>

          {/* Password */}
          <div className={m.field}>
            <label className={m.label} htmlFor="password">Contraseña</label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
            />
          </div>

          {/* Confirm password — sign-up only */}
          {isSignUp && (
            <div className={m.field}>
              <label className={m.label} htmlFor="confirm">Confirmar contraseña</label>
              <input
                id="confirm"
                className="form-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
          )}

          <button className={m.submitBtn} type="submit" disabled={loading}>
            {loading
              ? isSignUp ? 'Creando cuenta…' : 'Iniciando sesión…'
              : isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Mode toggle */}
        <p className={m.toggle}>
          {isSignUp ? (
            <>
              ¿Ya tienes cuenta?{' '}
              <button type="button" className={m.toggleLink} onClick={() => switchMode('signin')}>
                Iniciar sesión
              </button>
            </>
          ) : (
            <>
              ¿No tienes cuenta?{' '}
              <button type="button" className={m.toggleLink} onClick={() => switchMode('signup')}>
                Crear cuenta
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
