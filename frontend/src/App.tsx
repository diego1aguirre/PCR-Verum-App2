import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { AuthContext } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import VerumMail from './pages/VerumMail'
import Comunicado from './pages/Comunicado'
import Reporte from './pages/Reporte'
import Formateador from './pages/Formateador'
import MergePDF from './pages/MergePDF'
import Configuracion from './pages/Configuracion'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Wait for initial session check before rendering anything
  if (loading) return null

  return (
    <AuthContext.Provider value={user}>
      <Routes>
        {/* Public route */}
        <Route
          path="/login"
          element={user ? <Navigate to="/convocar-comite" replace /> : <Login />}
        />

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
