import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalysis } from '../store/DataContext'
import '../Design/Upload.css'

function Tabs({ tab, setTab }) {
  const Btn = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`tab-btn ${tab === id ? 'active' : ''}`}
    >
      {label}
    </button>
  )
  return (
    <div className="tabs">
      <Btn id="file"  label="Anexar .xlsx" />
      <Btn id="paste" label="Colar/Editar" />
    </div>
  )
}

function SimpleTable({ rows, setRows }) {
  if (!rows.length) {
    return <p className="muted">Cole os dados e clique em “Transformar em tabela”.</p>
  }
  const cols = Object.keys(rows[0])

  const onCellChange = (rIdx, key, value) => {
    setRows(prev => prev.map((r, i) => (i === rIdx ? { ...r, [key]: value } : r)))
  }
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx))

  return (
    <div className="table-wrap">
      <table className="simple-table">
        <thead>
          <tr>
            <th>#</th>
            {cols.map(c => <th key={c}>{c}</th>)}
            <th className="center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <td className="row-index">{ri + 1}</td>
              {cols.map(c => (
                <td key={c} className="cell">
                  <input
                    value={r[c] ?? ''}
                    onChange={(e) => onCellChange(ri, c, e.target.value)}
                    className="cell-input"
                  />
                </td>
              ))}
              <td className="center">
                <button type="button" onClick={() => removeRow(ri)} className="btn btn-danger btn-sm">
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Converte conteúdo colado (TSV) em objetos usando a 1ª linha como cabeçalho
function parseTSV(tsv) {
  const lines = tsv.split(/\r?\n/).filter(l => l.trim() !== '')
  if (!lines.length) return []
  const headers = lines[0].split('\t').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t')
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = (parts[idx] ?? '').trim() })
    if (Object.values(obj).some(v => v !== '')) rows.push(obj)
  }
  return rows
}

export default function Upload() {
  const [tab, setTab] = useState('file') // 'file' | 'paste'
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState(null)
  const { setAnalysis } = useAnalysis()
  const navigate = useNavigate()

  // estado do modo "Colar/Editar"
  const [pasteRaw, setPasteRaw] = useState('')
  const [rows, setRows] = useState([])

  const analyzeFile = async (e) => {
    e.preventDefault()
    setErr(null); setStatus(null); setAnalysis(null)
    if (!file) { setErr('Selecione um arquivo .xlsx'); return }

    try {
      setLoading(true)
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/analisar', { method:'POST', body: form })
      setStatus(res.status)
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}: ${text}`)
      if (!json) throw new Error('Resposta não é JSON válido')
      setAnalysis(json)
      navigate('/estatistica')
    } catch (e2) {
      setErr(e2.message || String(e2))
    } finally {
      setLoading(false)
    }
  }

  const handlePasteToTable = () => {
    setErr(null)
    const parsed = parseTSV(pasteRaw)
    setRows(parsed)
    if (!parsed.length) {
      setErr('Não foi possível detectar dados. Verifique se a primeira linha tem os cabeçalhos.')
    }
  }

  const analyzePasted = async () => {
    setErr(null); setStatus(null); setAnalysis(null)
    if (!rows.length) { setErr('Cole e/ou edite os dados na tabela antes de analisar'); return }

    try {
      setLoading(true)
      const res = await fetch('/api/analisar-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      })
      setStatus(res.status)
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}: ${text}`)
      if (!json) throw new Error('Resposta não é JSON válido')
      setAnalysis(json)
      navigate('/estatistica')
    } catch (e2) {
      setErr(e2.message || String(e2))
    } finally {
      setLoading(false)
    }
  }

  const kb = file ? Math.round(file.size / 1024) : 0

  return (
    <div className="upload-page">
      <header className="page-header">
        <h1 className="page-title">FluxCompras — Recebimento</h1>
        <p className="page-subtitle">Envie um .xlsx ou cole os dados para gerar a análise.</p>
      </header>

      <Tabs tab={tab} setTab={setTab} />

      {/* --- Anexar arquivo --- */}
      {tab === 'file' && (
        <form onSubmit={analyzeFile} className="card">
          <div className="form-row">
            <label className="label">Arquivo (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e)=>setFile(e.target.files?.[0] || null)}
              className="file-input"
            />
          </div>

          <div className="actions-row">
            <button type="submit" className="btn btn-primary" disabled={loading || !file}>
              {loading ? 'Analisando…' : 'Analisar .xlsx'}
            </button>

            {file && (
              <span className="meta">
                Arquivo: <b>{file.name}</b> ({kb} KB)
              </span>
            )}

            {status != null && <span className="status-pill">HTTP {status}</span>}
          </div>
        </form>
      )}

      {/* --- Colar/Editar --- */}
      {tab === 'paste' && (
        <div className="card">
          <p className="paste-help">
            Cole aqui sua planilha (copie do Excel/Planilhas com <b>cabeçalhos</b> iguais aos da exportação:
            <i> Cód, Data Atual., Op., Nota Fiscal, Série, Qtde, Valor, Cliente/Fornecedor, Histórico</i>).
          </p>

          <textarea
            value={pasteRaw}
            onChange={(e)=>setPasteRaw(e.target.value)}
            placeholder="Cole os dados aqui (separados por tabulação — TSV)…"
            rows={8}
            className="textarea"
          />

          <div className="actions-row">
            <button type="button" onClick={handlePasteToTable} className="btn btn-secondary">
              Transformar em tabela
            </button>
            <button type="button" onClick={()=>{ setRows([]); setPasteRaw('') }} className="btn">
              Limpar
            </button>
            <button type="button" onClick={analyzePasted} className="btn btn-primary" disabled={loading || rows.length === 0}>
              {loading ? 'Analisando…' : 'Analisar dados colados'}
            </button>
            {status != null && <span className="status-pill">HTTP {status}</span>}
          </div>

          <div className="table-card">
            <SimpleTable rows={rows} setRows={setRows} />
            <p className="muted tip">Dica: edite células e exclua linhas erradas antes de analisar.</p>
          </div>
        </div>
      )}

      {err && <div className="error-alert">⚠️ {err}</div>}

      <p className="note">
        Após a análise, você será redirecionado para <b>Estatística</b>.
      </p>
    </div>
  )
}
