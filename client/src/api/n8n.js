
const N8N_URL = 'https://davisouto.app.n8n.cloud/webhook-test/web-research';

export async function pesquisar(tema, janela = 'm1', itens = 4) {
  const payload = {
    tema: String(tema || '').trim(),
    janela: String(janela || 'm1').trim(),
    itens: Math.max(1, Math.min(8, Number(itens || 4))),
  };

  const res = await fetch(N8N_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log('[n8n] HTTP status:', res.status);
  console.log('[n8n] Raw response text (first 400):', text.slice(0, 400));

  if (text.trim().startsWith('<')) {
    throw new Error('Resposta HTML do n8n (provável /webhook-test sem Listen ativo).');
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Resposta não-JSON do n8n: ${text.slice(0, 200)}`);
  }

  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }

  
  let body = json;
  if (body?.data) body = body.data;
  if (body?.data) body = body.data; 

  
  if (!body.results && Array.isArray(json) && json[0]?.json) {
    body = json[0].json.data || json[0].json;
  }

  
  const clean = (v) => (typeof v === 'string' ? v.replace(/\s+$/,'').trim() : v);

  const out = {
    tema: clean(body.tema) ?? payload.tema,
    janela: clean(body.janela) ?? payload.janela,
    itens: body.itens ?? payload.itens,
    generatedAt: body.generatedAt || new Date().toISOString(),
    results: Array.isArray(body.results) ? body.results : [],
  };

  console.log('[n8n] Normalized body:', out);
  return out;
}

