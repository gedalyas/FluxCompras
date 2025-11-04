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

// normaliza custo como string (aceita "12,50" ou "12.50", mantém como string p/ backend decidir)
const normCostStr = (v) => {
  if (v == null) return ''
  return String(v).replace(',', '.').trim()
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

  // NOVO: campos manuais
  const [productName, setProductName] = useState('')
  const [costPrice, setCostPrice] = useState('') // string; backend normaliza
  const [costHint, setCostHint] = useState('')   // mensagem de ajuda/erro suave

  const onCostBlur = () => {
    const raw = (costPrice ?? '').toString().trim()
    if (!raw) {
      setCostHint('Informe o custo unitário (ex.: 12,50).')
      return
    }
    // normaliza para 2 casas mantendo vírgula na exibição
    const num = Number(raw.replace(',', '.'))
    if (!isFinite(num) || num < 0) {
      setCostHint('Valor inválido. Use números (ex.: 12,50).')
      return
    }
    setCostHint('')
    const fixed = num.toFixed(2).replace('.', ',')
    setCostPrice(fixed)
  }

  const analyzeFile = async (e) => {
    e.preventDefault()
    setErr(null); setStatus(null); setAnalysis(null)
    if (!file) { setErr('Selecione um arquivo .xlsx'); return }
    if (!costPrice) { setErr('Informe o custo unitário do produto'); return }

    try {
      setLoading(true)
      const form = new FormData()
      form.append('file', file)
      form.append('productName', productName || '')
      form.append('costPrice', normCostStr(costPrice) || '0')
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
    if (!costPrice) { setErr('Informe o custo unitário do produto'); return }

    try {
      setLoading(true)
      const res = await fetch('/api/analisar-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          productName: productName || '',
          costPrice: normCostStr(costPrice) || '0'
        })
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
        <p className="page-subtitle">
          Envie um .xlsx ou cole os dados para gerar a análise.<br />
          <b>Importante:</b> informe abaixo o <b>Nome do produto</b> e o <b>Custo unitário</b> (manual).
        </p>
      </header>

      {/* NOVO: campos comuns aos dois modos */}
      <form className="card aesthetic-card" onSubmit={(e)=>e.preventDefault()}>
        <div className="form-row two-col">
          {/* Nome do produto */}
          <div className="field">
            <label className="label">Nome do produto</label>
            <div className="input-group">
              <span className="icon-left" aria-hidden="true">
                {/* ícone de tag */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M20.59 13.41L11 3.82a2 2 0 0 0-1.41-.59H4v5.59a2 2 0 0 0 .59 1.41l9.59 9.59a2 2 0 0 0 2.83 0l3.58-3.58a2 2 0 0 0 0-2.83Z" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="ex.: Chave combinada 24 Tramontina"
                value={productName}
                onChange={(e)=>setProductName(e.target.value)}
                className="text-input has-icon-left"
                maxLength={120}
                aria-label="Nome do produto"
              />
            </div>
          </div>

          {/* Custo unitário */}
          <div className="field">
            <label className="label">Custo unitário</label>
            <div className={`input-group ${(!costPrice || costHint) ? 'needs-value' : ''}`}>
              <span className="prefix">R$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={costPrice}
                onChange={(e)=>setCostPrice(e.target.value)}
                onBlur={onCostBlur}
                className="text-input has-prefix"
                aria-label="Custo unitário"
              />
            </div>
            <small className={`helper ${costHint ? 'warn' : ''}`}>
              {costHint || 'Aceita vírgula ou ponto. Ex.: 12,50'}
            </small>
          </div>
        </div>
      </form>

      <Tabs tab={tab} setTab={setTab} />

      
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
