import { useState } from 'react';
import { pesquisar } from '../api/conexao';

const JANELAS = [
  { label: '7 dias', value: 'd7' },
  { label: '2 semanas', value: 'w2' },
  { label: '1 mês', value: 'm1' },
  { label: '6 meses', value: 'm6' },
];

export default function Pesquisa() {
  const [tema, setTema] = useState('aço');
  const [janela, setJanela] = useState('m1');
  const [itens, setItens] = useState(4);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [results, setResults] = useState([]);

  async function onPesquisar() {
  try {
    setErro(null);
    setLoading(true);
    setResults([]);

    const t = (tema || '').trim();
    if (t.length < 2) throw new Error('Informe um tema com pelo menos 2 caracteres.');
    if (itens < 1 || itens > 8) throw new Error('Quantidade deve ser entre 1 e 8.');

    const body = await pesquisar(t, janela, itens);
    console.log('[UI] API ->', body);

    if (!Array.isArray(body.results)) {
      console.warn('[UI] results não é array:', body.results);
      setResults([]);
    } else {
      setResults(body.results);
    }
  } catch (e) {
    console.error('[UI] onPesquisar ERRO:', e);
    setErro(e.message || 'Erro inesperado.');
  } finally {
    setLoading(false);
  }
}


  function onLimpar() {
    setTema('');
    setJanela('m1');
    setItens(4);
    setErro(null);
    setResults([]);
  }

  return (
    <div style={{ maxWidth: 820, margin: '24px auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Pesquisar tendências de mercado</h1>

      <div style={{ background:'#eef6ff', border:'1px solid #cfe3ff', borderRadius:12, padding:16, marginBottom:16 }}>
        <label style={{ display:'block', marginBottom:8 }}>
          Tema
          <input
            value={tema}
            onChange={e => setTema(e.target.value)}
            placeholder="ex.: aço, cobre, energia solar"
            style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #cbd5e1', marginTop:6 }}
          />
        </label>

        <div style={{ display:'flex', gap:12, marginTop:8 }}>
          <label style={{ flex:1 }}>
            Janela
            <select
              value={janela}
              onChange={e => setJanela(e.target.value)}
              style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #cbd5e1', marginTop:6 }}
            >
              {JANELAS.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
          </label>

          <label style={{ width:150 }}>
            Itens (1–8)
            <input
              type="number" min={1} max={8}
              value={itens}
              onChange={e => setItens(Number(e.target.value))}
              style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #cbd5e1', marginTop:6 }}
            />
          </label>
        </div>

        <div style={{ display:'flex', gap:12, marginTop:16 }}>
          <button type="button" onClick={onPesquisar} disabled={loading}
            style={{ padding:'10px 16px', borderRadius:10, border:'none', background:'#2563eb', color:'#fff' }}>
            {loading ? 'Pesquisando…' : 'Pesquisar'}
          </button>
          <button type="button" onClick={onLimpar} disabled={loading}
            style={{ padding:'10px 16px', borderRadius:10, border:'1px solid #cbd5e1', background:'#fff' }}>
            Limpar
          </button>
        </div>
      </div>

      {erro && <div style={{ color:'#b91c1c', marginBottom:12 }}>{erro}</div>}

      <div style={{ display:'grid', gap:12 }}>
        {results.map((r, i) => (
          <div key={i} style={{ border:'1px solid #e2e8f0', borderRadius:12, padding:14, background:'#fff' }}>
            <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize:18, color:'#1e40af', textDecoration:'none' }}>
              {r.title}
            </a>
            <div style={{ color:'#334155', marginTop:6 }}>{r.summary}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10, fontSize:13, color:'#475569' }}>
              {r.source && <span><b>Fonte:</b> {r.source}</span>}
              {r.date && <span><b>Data:</b> {r.date}</span>}
              {r.category && <span><b>Categoria:</b> {r.category}</span>}
              {r.signal && <span><b>Sinal:</b> {r.signal}</span>}
              {r.confidence && <span><b>Confiança:</b> {r.confidence}</span>}
            </div>
          </div>
        ))}
        {!loading && !erro && results.length === 0 && (
          <div style={{ color:'#64748b' }}>Sem resultados ainda. Faça uma pesquisa.</div>
        )}
      </div>
    </div>
  );
}
