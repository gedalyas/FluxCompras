// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

import { analyzeBuffer, analyzePlainRows } from './analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ============================ Middlewares base ============================ */

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// JSON grande
app.use(express.json({ limit: '10mb' }));

// Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Multer: memória + limites + filtro .xlsx
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    if (!ok) return cb(new Error('Envie um arquivo .xlsx'));
    cb(null, true);
  },
});

// Carrega config local (para sua rota de análise)
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

/* ================================ Rotas API =============================== */

// healthcheck
app.get('/api/ping', (_, res) => res.json({ ok: true }));

// ------------------------ ANÁLISE XLSX (arquivo) --------------------------
app.post('/api/analisar', upload.single('file'), async (req, res) => {
  try {
    console.log('Upload recebido:', {
      hasFile: !!req.file,
      name: req.file?.originalname,
      size: req.file?.size,
      type: req.file?.mimetype,
      productName: req.body?.productName,
      costPrice: req.body?.costPrice,
    });
    if (!req.file) {
      return res.status(400).json({ error: 'Envie um arquivo .xlsx no campo "file"' });
    }

    // Campos extras do formulário
    const productName = String(req.body?.productName || '').trim();
    const costPrice   = String(req.body?.costPrice ?? '0'); // aceita "12,50" ou "12.50"

    // Passa as opções para o analyzer (o seu analyzer atualizado aceita o 3º arg)
    const result = await analyzeBuffer(req.file.buffer, config, { productName, costPrice });

    return res.json(result);
  } catch (err) {
    console.error('ERRO /api/analisar:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

// -------------------- ANÁLISE JSON (dados colados/limpos) -----------------
app.post('/api/analisar-json', async (req, res) => {
  try {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Envie { rows: [...] } com ao menos 1 linha' });
    }

    const productName = String(req.body?.productName || '').trim();
    const costPrice   = String(req.body?.costPrice ?? '0');

    const result = await analyzePlainRows(rows, config, { productName, costPrice });
    return res.json(result);
  } catch (err) {
    console.error('ERRO /api/analisar-json:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

/* ============================ Web Research block =========================== */

// validação de .env
function assertEnv() {
  const missing = [];
  if (!process.env.GOOGLE_API_KEY) missing.push('GOOGLE_API_KEY');
  if (!process.env.GOOGLE_CX) missing.push('GOOGLE_CX');
  if (!process.env.PPLX_API_KEY) missing.push('PPLX_API_KEY');
  if (missing.length) {
    throw new Error(`Faltando variáveis de ambiente: ${missing.join(', ')}. Verifique seu .env.`);
  }
}

// aceita "m1/w2/d7/y1" e também "1m/2w/7d/1y"
function dateRestrict(janela = 'd7') {
  if (typeof janela !== 'string') return 'd7';
  const v = janela.trim().toLowerCase();

  if (/^[dwmy]\d+$/.test(v)) return v; // "d7","m1"...

  const m = v.match(/^(\d+)\s*([dwmy])$/); // "7d","1m"...
  if (m) return `${m[2]}${Number(m[1])}`;

  return 'd7';
}

// janela relativa -> intervalo absoluto YYYYMMDD
function buildDateRange(janela = 'm1') {
  const v = dateRestrict(janela);
  const n = parseInt(v.slice(1), 10) || 1;
  const u = v[0];

  const end = new Date();
  const start = new Date(end);
  if (u === 'd') start.setDate(start.getDate() - n);
  if (u === 'w') start.setDate(start.getDate() - n * 7);
  if (u === 'm') start.setMonth(start.getMonth() - n);
  if (u === 'y') start.setFullYear(start.getFullYear() - n);

  const toYmd = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  return { start: toYmd(start), end: toYmd(end) };
}

function buildQuery(tema = 'aço') {
  const t = tema.trim();
  const steel =
    (t.toLowerCase() === 'aço' || t.toLowerCase() === 'aco')
      ? '(aço OR "aco" OR steel OR siderúrgica OR siderurgia)'
      : `"${t}"`;

  const must = [
    steel,
    '(preço OR cotação OR price OR "per ton" OR tonelada OR HRC OR "hot rolled" OR rebar OR slab OR chapa OR laminado)',
    '(mercado OR demanda OR oferta OR produção OR exporta* OR importa* OR tarifa OR antidumping OR subsídio OR capacidade OR siderúrgica OR usiminas OR gerdau OR csn OR arcelormittal)',
    '(notícia OR reportagem OR análise OR report OR update)',
  ].join(' ');

  const block = [
    '-loja -oferta -promoção -compre -venda -mercadolivre -magazineluiza -amazon -shopee',
    '-instagram -facebook -pinterest',
    '-prefeitura -sefaz -arrecadacao -arrecadação -transparencia -transparência -iptu -iss -icms',
  ].join(' ');

  const whitelist =
    '(site:valor.globo.com OR site:exame.com OR site:bloomberglinea.com.br OR site:oglobo.globo.com OR site:agenciabrasil.ebc.com.br OR site:reuters.com OR site:br.investing.com OR site:estadao.com.br OR site:bbc.com)';

  return `${must} ${block} ${whitelist}`;
}

function stripFences(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
}

function isInsideWindowISO(iso, startYmd, endYmd) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return false;
  const toYmd = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${y}${m}${dd}`;
  };
  const ymd = toYmd(d);
  return ymd >= startYmd && ymd <= endYmd;
}

// ---------- Google CSE ----------
function buildBaseCseUrl() {
  const key = process.env.GOOGLE_API_KEY;
  const cx  = process.env.GOOGLE_CX;
  if (!key || !cx) throw new Error('GOOGLE_API_KEY/GOOGLE_CX ausente(s).');
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('hl', 'pt-BR');
  url.searchParams.set('gl', 'br');
  url.searchParams.set('safe', 'active');
  return url;
}

async function cseFetch({ q, num, janela }) {
  const base = buildBaseCseUrl();
  base.searchParams.set('q', q);
  base.searchParams.set('num', String(Math.min(10, num))); // CSE cap 10
  base.searchParams.set('dateRestrict', dateRestrict(janela));

  // log sem expor a key
  const log = new URL(base);
  log.searchParams.delete('key');
  console.log('CSE URL =>', log.toString());

  const resp = await fetch(base, { method: 'GET' });
  const json = await resp.json();
  if (!resp.ok) {
    const msg = json?.error?.message || `HTTP ${resp.status}`;
    throw new Error(`CSE falhou: ${msg}`);
  }
  return json;
}

// --------------------------- /api/web-research -----------------------------
app.post('/api/web-research', async (req, res) => {
  try {
    assertEnv();

    const tema = String(req.body?.tema || 'aço').trim();
    const janela = String(req.body?.janela || 'm1').trim(); // d7, w2, m1, m6…
    const itens = Math.max(1, Math.min(8, Number(req.body?.itens || 4)));

    // 1) Google Custom Search (CSE)
    const q = buildQuery(tema);
    const num = Math.min(10, itens * 4);

    const cseJson = await cseFetch({ q, num, janela });
    const { start, end } = buildDateRange(janela);

    // enriquecer com metadados de data e filtrar quando possível
    const items = Array.isArray(cseJson.items) ? cseJson.items : [];
    const enriched = items.map(i => {
      const meta = (i.pagemap?.metatags?.[0]) || {};
      const dateGuess =
        meta['article:published_time'] ||
        meta['og:updated_time'] ||
        meta['date'] ||
        null;
      return { ...i, _dateGuess: dateGuess };
    });

    const filtered = enriched.filter(i => {
      if (i._dateGuess) return isInsideWindowISO(i._dateGuess, start, end);
      return true; // sem data → deixa para o LLM decidir/mostrar
    });

    const links = filtered.slice(0, 12).map(i => ({
      title: i.title,
      url: i.link,
      snippet: i.snippet,
    }));

    // 2) Perplexity — sintetizar notas estruturadas
    const pplxResp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PPLX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: 'system',
            content: [
              'Você é um assistente analítico. Gere saídas ESTRITAMENTE em JSON válido.',
              'USE APENAS os links fornecidos; não invente fatos.',
              `Ignore links fora da janela ${janela} (${start}..${end}).`,
            ].join(' ')
          },
          {
            role: 'user',
            content:
`Links coletados (máx 12):
${JSON.stringify(links, null, 2)}

Hoje é ${new Date().toISOString().slice(0,10)}.
Janela pedida: ${janela} (apenas links dentro deste período).

Tarefa: produza ${itens} notas sobre "${tema}" (pt-BR). Para cada nota:
- title
- summary (1–2 frases, factual e conciso)
- url
- source (nome do veículo)
- date (ISO se houver)
- category ("Preço/Cotação", "Demanda/Oferta/Produção", "Política/Regulação", "Empresas/Siderurgia", "Outros")
- signal ("Alta" | "Queda" | "Neutro")
- confidence ("Baixa" | "Média" | "Alta")

Responda SOMENTE em JSON no formato:
{
  "tema": "${tema}",
  "janela": "${janela}",
  "itens": ${itens},
  "results": [
    { "title": "...", "summary": "...", "url": "...", "source": "...", "date": "", "category": "...", "signal": "...", "confidence": "..." }
  ]
}`
          }
        ]
      })
    });

    const pplxJson = await pplxResp.json();
    if (!pplxResp.ok) {
      const msg = pplxJson?.error?.message || JSON.stringify(pplxJson);
      throw new Error(`Perplexity falhou: ${msg}`);
    }

    const raw = pplxJson?.choices?.[0]?.message?.content || '';
    const text = stripFences(raw);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { parsed = { tema, janela, itens, results: [] }; }

    const out = {
      tema: parsed.tema ?? tema,
      janela: parsed.janela ?? janela,
      itens: parsed.itens ?? itens,
      generatedAt: new Date().toISOString(),
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };

    return res.status(200).json(out);
  } catch (err) {
    console.error('ERRO /api/web-research:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

/* ========================== Error handlers finais ========================== */

// handler de erros do multer (tamanho, tipo, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err && err.message === 'Envie um arquivo .xlsx') {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

/* ================================== Start ================================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
});
