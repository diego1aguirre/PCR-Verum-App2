import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import m from './Login.module.css'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.updateUser({ password })
      if (authError) throw authError
      setSuccessMsg('Contraseña actualizada correctamente.')
      setTimeout(() => navigate('/convocar-comite', { replace: true }), 2000)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo actualizar la contraseña. Inténtalo de nuevo.',
      )
    } finally {
      setLoading(false)
    }
  }

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

        <h2 className={m.title}>Nueva contraseña</h2>

        <form className={m.form} onSubmit={handleSubmit}>
          {error && <div className={m.error}>{error}</div>}
          {successMsg && <div className={m.success}>{successMsg}</div>}

          <div className={m.field}>
            <label className={m.label} htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
              required
            />
          </div>

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

          <button className={m.submitBtn} type="submit" disabled={loading || !!successMsg}>
            {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
