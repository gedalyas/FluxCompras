import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import Upload from './pages/Upload'
import Estatistica from './pages/Estatistica'
import Analise from './pages/Analise'
import { DataProvider } from './store/DataContext'
import ProcuraPreço from './pages/ProcuraPreço'
import Pesquisa from './pages/Pesquisa'

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <NavBar />
        <Routes>
          <Route path="/" element={<Upload />} />
          <Route path="/estatistica" element={<Estatistica />} />
          <Route path="/analise" element={<Analise />} />
          <Route path="/procurador" element={<ProcuraPreço />} />
          <Route path="/pesquisa" element={<Pesquisa/>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DataProvider>
    </BrowserRouter>
  )
}
