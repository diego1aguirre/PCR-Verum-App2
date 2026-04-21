import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import VerumMail from './pages/VerumMail'
import Formateador from './pages/Formateador'
import MergePDF from './pages/MergePDF'
import Configuracion from './pages/Configuracion'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/verum-mail" replace />} />
        <Route path="verum-mail" element={<VerumMail />} />
        <Route path="formateador" element={<Formateador />} />
        <Route path="merge-pdf" element={<MergePDF />} />
        <Route path="configuracion" element={<Configuracion />} />
      </Route>
    </Routes>
  )
}
