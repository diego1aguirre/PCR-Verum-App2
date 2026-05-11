import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { AuthContext } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import VerumMail from './pages/VerumMail'
import Comunicado from './pages/Comunicado'
import Reporte from './pages/Reporte'
import Formateador from './pages/Formateador'
import MergePDF from './pages/MergePDF'
import Configuracion from './pages/Configuracion'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // getSession() automatically processes any auth tokens in the URL hash
    // when the client is configured with detectSessionInUrl + flowType:'implicit'.
    // The loading=true / return null above ensures no redirect fires before this
    // resolves, so signup confirmation and recovery links always land correctly.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      // Remove processed tokens from the URL so they don't persist in history
      if (window.location.hash) {
        window.history.replaceState({}, '', window.location.pathname + window.location.search)
      }
    })

    // Listen for auth state changes (login / logout / password recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      // Password-reset links carry type=recovery — once the session is established
      // redirect to the reset-password page so the user can set their new password.
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Wait for initial session check before rendering anything
  if (loading) return null

  return (
    <AuthContext.Provider value={user}>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={user ? <Navigate to="/convocar-comite" replace /> : <Login />}
        />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected routes — redirect to /login if not authenticated */}
        <Route
          path="/"
          element={user ? <Layout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Navigate to="/convocar-comite" replace />} />
          <Route path="convocar-comite" element={<VerumMail />} />
          {/* Legacy redirect so any saved /verum-mail links still work */}
          <Route path="verum-mail" element={<Navigate to="/convocar-comite" replace />} />
          <Route path="comunicado" element={<Comunicado />} />
          <Route path="reporte" element={<Reporte />} />
          <Route path="merge-pdf" element={<MergePDF />} />
          <Route path="formateador" element={<Formateador />} />
          <Route path="configuracion" element={<Configuracion />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={user ? '/convocar-comite' : '/login'} replace />} />
      </Routes>
    </AuthContext.Provider>
  )
}
