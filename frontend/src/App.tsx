import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import VerumMail from './pages/VerumMail'
import Comunicado from './pages/Comunicado'
import Reporte from './pages/Reporte'
import Formateador from './pages/Formateador'
import MergePDF from './pages/MergePDF'
import Configuracion from './pages/Configuracion'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
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
    </Routes>
  )
}
