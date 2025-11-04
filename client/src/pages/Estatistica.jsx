import { useMemo, useState } from 'react'
import { useAnalysis } from '../store/DataContext'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  LineChart, Line
} from 'recharts'
import '../Design/Estatistica.css'

const PT_BR_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const Table = ({ rows, title }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="card">
        {title && <h3 className="card-title">{title}</h3>}
        <p className="muted">Sem dados</p>
      </div>
    )
  }
  const cols = Object.keys(rows[0])
  return (
    <div className="card">
      {title && <h3 className="card-title">{title}</h3>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {cols.map(c => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------- helpers de formatação ---------- */
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 2 })

export default function Estatistica() {
  const { analysis } = useAnalysis()
  if (!analysis) {
    return (
      <div className="page">
        <div className="page-header">
          <h2 className="title">Estatística</h2>
          <p className="muted">Envie a planilha na tela de <b>Recebimento</b> primeiro.</p>
        </div>
      </div>
    )
  }

  /* ===================== BLOCO ORIGINAL (quantidades) ===================== */

  const vendasMensais = analysis?.vendasMensais ?? []
  const anosDisponiveis = useMemo(() => {
    const s = new Set()
    for (const r of vendasMensais) {
      const y = String(r.periodo).slice(0, 4)
      if (/^\d{4}$/.test(y)) s.add(y)
    }
    const arr = Array.from(s).sort()
    return arr.length ? arr : [String(new Date().getFullYear())]
  }, [vendasMensais])

  const [ano, setAno] = useState(anosDisponiveis[anosDisponiveis.length - 1])

  const chartData = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => ({
      mesNum: i + 1,
      mes: PT_BR_MONTHS[i],
      vendas: 0
    }))
    for (const r of vendasMensais) {
      const y = String(r.periodo).slice(0, 4)
      const m = Number(String(r.periodo).slice(5, 7))
      if (y === String(ano) && m >= 1 && m <= 12) {
        base[m - 1].vendas += Number(r.total_abs) || 0
      }
    }
    return base
  }, [vendasMensais, ano])

  // ---- Sazonalidade (perfil por mês-do-ano) ----
  const sazonalPerfil = analysis?.seasonalityProfile ?? []
  const temSazonalidade = sazonalPerfil && sazonalPerfil.length > 0

  /* ======================== NOVO: BLOCO FINANCEIRO ======================== */

  const hasFinancial = !!analysis?.financial
  const productName = analysis?.productName || ''
  const costPrice = analysis?.costPrice ?? 0

  const finTotalsRaw = analysis?.financial?.totals || null
  const finMonthlyRaw = analysis?.financial?.monthly || []
  const finSeries = analysis?.financial?.series || { ganhoXtempo: [], lucroXtempo: [] }
  const finSensitivity = analysis?.financial?.sensitivity || []

  // Compatibilidade: o backend novo manda costSalesBased/costPurchaseBased.
  // Aqui escolhemos costSalesBased como “Custo” padrão (e caímos pra cost se existir).
  const finTotals = finTotalsRaw && {
    ...finTotalsRaw,
    cost: (finTotalsRaw.costSalesBased ?? finTotalsRaw.cost ?? 0)
  }

  const finMonthly = (finMonthlyRaw || []).map(m => ({
    ...m,
    cost: (m.costSalesBased ?? m.cost ?? 0)
  }))

  // mapear séries para Recharts
  const ganhoSerie = (finSeries.ganhoXtempo || []).map(p => ({ month: p.x, valor: p.y }))
  const lucroSerie = (finSeries.lucroXtempo || []).map(p => ({ month: p.x, valor: p.y }))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="title">Estatística</h2>
          {analysis.cutoffInfo && (
            <p className="muted">
              Período considerado: <b>{analysis.cutoffInfo.firstDate || '—'}</b> até <b>{analysis.cutoffInfo.lastDate || '—'}</b> (mínimo: {analysis.cutoffInfo.minDate})
            </p>
          )}
        </div>

        {/* Cabeçalho do produto/custo se vierem do backend */}
        {hasFinancial && (
          <div className="pill">
            <span className="muted">Produto:</span> <b>{productName || '—'}</b>
            <span className="sep">•</span>
            <span className="muted">Custo (unid.):</span> <b>{fmtMoney(costPrice)}</b>
          </div>
        )}
      </div>

      {/* KPIs originais */}
      <div className="grid">
        <div className="card kpi">
          <div className="kpi-label">Vendas sem data</div>
          <div className="kpi-value">{analysis.alerts?.vendasSemData ?? 0}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Vendas com Qtde 0</div>
          <div className="kpi-value">{analysis.alerts?.vendasQtyZero ?? 0}</div>
        </div>

        {/* KPIs financeiros (se disponíveis) */}
        {hasFinancial && finTotals && (
          <>
            <div className="card kpi">
              <div className="kpi-label">Receita Total</div>
              <div className="kpi-value">{fmtMoney(finTotals.revenue)}</div>
            </div>
            <div className="card kpi">
              <div className="kpi-label">Custo Total</div>
              <div className="kpi-value">{fmtMoney(finTotals.cost)}</div>
            </div>
            <div className="card kpi">
              <div className="kpi-label">Lucro Total</div>
              <div className="kpi-value">{fmtMoney(finTotals.profit)}</div>
            </div>
            <div className="card kpi">
              <div className="kpi-label">Margem</div>
              <div className="kpi-value">{fmtPct(finTotals.marginPct)}</div>
            </div>
          </>
        )}
      </div>

      {/* Gráfico original: Vendas por mês (Qtde) */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Vendas por mês</h3>
          <div className="controls">
            <label htmlFor="sel-ano" className="label">Ano</label>
            <select id="sel-ano" value={ano} onChange={(e) => setAno(e.target.value)} className="select">
              {anosDisponiveis.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="chart">
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
              <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', color: 'var(--text)' }}
                formatter={(value) => [value, 'Vendas (Qtde)']}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload
                  return `${item?.mes} / ${ano} — mês ${item?.mesNum}`
                }}
              />
              <Bar dataKey="vendas" radius={[6, 6, 0, 0]} fill="var(--brand-500)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfico sazonalidade original */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Sazonalidade — Perfil por mês do ano</h3>
          {!temSazonalidade && <span className="muted">(sem dados suficientes)</span>}
        </div>
        {temSazonalidade && (
          <div className="chart small">
            <ResponsiveContainer>
              <BarChart data={sazonalPerfil} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                <XAxis dataKey="mes" tick={{ fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis domain={[0, 'dataMax']} tick={{ fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', color: 'var(--text)' }}
                  formatter={(v) => [`${v}x da média`, `Índice`]}
                  labelFormatter={(label, payload) => {
                    const p = payload?.[0]?.payload
                    const media = (p?.mediaVendasMes ?? 0)
                    return `${label} — média (Qtde): ${media}`
                  }}
                />
                <ReferenceLine y={1} stroke="var(--brand-500)" strokeDasharray="4 4" />
                <Bar dataKey="indice" radius={[6, 6, 0, 0]} fill="var(--brand-400)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ======================= NOVOS GRÁFICOS FINANCEIROS ======================= */}
      {hasFinancial && (
        <>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Ganho × Tempo (Receita mensal)</h3>
            </div>
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={ganhoSerie} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis tick={{ fill: 'var(--text-muted)' }} tickFormatter={(v) => fmtMoney(v)} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', color: 'var(--text)' }}
                    formatter={(v) => [fmtMoney(v), 'Receita']}
                    labelFormatter={(l) => `Mês: ${l}`}
                  />
                  <Line type="monotone" dataKey="valor" stroke="var(--brand-500)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Lucro × Tempo (Lucro mensal)</h3>
            </div>
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={lucroSerie} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis tick={{ fill: 'var(--text-muted)' }} tickFormatter={(v) => fmtMoney(v)} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', color: 'var(--text)' }}
                    formatter={(v) => [fmtMoney(v), 'Lucro']}
                    labelFormatter={(l) => `Mês: ${l}`}
                  />
                  <Line type="monotone" dataKey="valor" stroke="var(--brand-400)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela financeira (mensal) */}
          <Table
            title="Financeiro mensal (qty, receita, custo, lucro)"
            rows={finMonthly.map(r => ({
              mês: r.month,
              quantidade: r.qty ?? r.qtySold ?? 0,
              receita: fmtMoney(r.revenue),
              custo: fmtMoney(r.cost), // já mapeado para costSalesBased com fallback
              lucro: fmtMoney(r.profit),
              margem: r.revenue > 0 ? fmtPct(r.profit / r.revenue) : '—'
            }))}
          />

          {/* Sensibilidade (compat: aceita formato flat e aninhado) */}
          {!!(finSensitivity?.length) && (
            <Table
              title="Ganho × Valor de Custo (sensibilidade)"
              rows={finSensitivity.map(s => {
                // se vier no formato novo (flat):
                if ('totalCost' in s || 'totalProfit' in s || 'marginPct' in s) {
                  return {
                    'multiplicador de custo': `${(s.costMultiplier ?? 1).toFixed(2)}×`,
                    'custo total': fmtMoney(s.totalCost),
                    'lucro total': fmtMoney(s.totalProfit),
                    'margem': fmtPct(s.marginPct),
                  }
                }
                // senão, usar o bloco "salesBased" por padrão
                const sb = s.salesBased || {}
                return {
                  'multiplicador de custo': `${(s.costMultiplier ?? 1).toFixed(2)}×`,
                  'custo total': fmtMoney(sb.totalCost),
                  'lucro total': fmtMoney(sb.totalProfit),
                  'margem': fmtPct(sb.marginPct),
                }
              })}
            />
          )}

        </>
      )}

      {/* tabelas originais */}
      <Table rows={analysis.resumoPorTipo} title="Resumo por tipo" />
      <Table rows={analysis.monthlyPivot} title="Mensal (todas operações)" />
      <Table rows={analysis.vendasMensais} title="Vendas mensais" />
      <Table rows={analysis.vendasTrimestrais} title="Vendas trimestrais" />
      <Table rows={analysis.vendasSemestrais} title="Vendas semestrais" />
      <Table rows={analysis.vendasAnuais} title="Vendas anuais" />
    </div>
  )
}
