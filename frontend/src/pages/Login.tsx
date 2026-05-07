import { useState } from 'react'
import { supabase } from '../lib/supabase'
import m from './Login.module.css'

type Mode = 'signin' | 'signup' | 'reset'

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

    // Domain restriction — enforced on all modes (error is intentionally generic)
    if (!email.trim().toLowerCase().endsWith('@verum.mx')) {
      if (mode === 'reset') {
        setSuccessMsg('Revisa tu correo para restablecer tu contraseña.')
        return
      }
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
      } else if (mode === 'signup') {
        const { error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (authError) throw authError
        setSuccessMsg('Revisa tu correo para confirmar tu cuenta.')
        setPassword('')
        setConfirm('')
      } else {
        // reset
        const { error: authError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: window.location.origin + '/reset-password' },
        )
        if (authError) throw authError
        setSuccessMsg('Revisa tu correo para restablecer tu contraseña.')
      }
    } catch (err) {
      if (mode === 'reset') {
        setSuccessMsg('Revisa tu correo para restablecer tu contraseña.')
      } else {
        setError(
          err instanceof Error && err.message
            ? err.message
            : mode === 'signin'
            ? 'Credenciales incorrectas. Inténtalo de nuevo.'
            : 'No se pudo crear la cuenta. Inténtalo de nuevo.',
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const isSignUp = mode === 'signup'
  const isReset = mode === 'reset'

  return (
    <div className={m.page}>
      <div className={m.card}>
        <div className={m.cardInner}>
        {/* Logo + tagline */}
        <div className={m.logoWrap}>
          <img
            src="https://pcrverum.mx/wp-content/uploads/2021/08/logo.cliente.png"
            alt="PCR Verum"
            className={m.logo}
          />
        </div>
        <p className={m.tagline}>Plataforma interna de operaciones</p>

        {/* Mode title */}
        <h2 className={m.title}>
          {isSignUp ? 'Crear cuenta' : isReset ? 'Recuperar contraseña' : 'Iniciar sesión'}
        </h2>

        <form className={m.form} onSubmit={handleSubmit}>
          {/* Error */}
          {error && <div className={m.error}>{error}</div>}

          {/* Success */}
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

          {/* Password — hidden in reset mode */}
          {!isReset && (
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
              {/* Forgot password link — sign-in only */}
              {!isSignUp && (
                <button
                  type="button"
                  className={m.forgotLink}
                  onClick={() => switchMode('reset')}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
            </div>
          )}

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
              ? isReset ? 'Enviando…' : isSignUp ? 'Creando cuenta…' : 'Iniciando sesión…'
              : isReset ? 'Enviar enlace de recuperación' : isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Mode toggle / back link */}
        <p className={m.toggle}>
          {isReset ? (
            <button type="button" className={m.toggleLink} onClick={() => switchMode('signin')}>
              Volver al inicio de sesión
            </button>
          ) : isSignUp ? (
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
        </div>{/* /cardInner */}
      </div>
    </div>
  )
}
