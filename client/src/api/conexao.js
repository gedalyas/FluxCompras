// src/api/conexao.js
const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/web-research';

export async function pesquisar(tema, janela = 'm1', itens = 4) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      tema: String(tema || '').trim(),
      janela: String(janela || 'm1').trim(),
      itens: Math.max(1, Math.min(8, Number(itens || 4))),
    }),
  });

  const json = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }

  return {
    tema: json.tema,
    janela: json.janela,
    itens: json.itens,
    generatedAt: json.generatedAt,
    results: Array.isArray(json.results) ? json.results : [],
  };
}
