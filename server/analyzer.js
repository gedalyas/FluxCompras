// analyzer.js — exceljs + cabeçalho tolerante + datas robustas (sem ESTOQUE, 2022+)
import ExcelJS from 'exceljs';

/* ----------------------------- Config de corte ----------------------------- */
const MIN_DATE = new Date(2022, 0, 1); // considerar apenas >= 01/01/2022

/* ----------------------------- Helpers gerais ----------------------------- */

const normalize = (s) => {
  if (s == null) return '';
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\./g, '')                                // remove pontos
    .replace(/\s+/g, ' ')                              // colapsa espaços
    .trim()
    .toLowerCase();
};

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Serial do Excel -> Date (base 1899-12-30)
const excelSerialToDate = (n) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + n * msPerDay);
};

// Converte: Date | serial | "dd/mm/aaaa [hh:mm[:ss]]"
const toDate = (v, dayfirst = true) => {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v;

  if (typeof v === 'number' && isFinite(v)) {
    if (v > 18000 && v < 90000) { // ~1950..2120
      const dt = excelSerialToDate(v);
      return isNaN(dt) ? null : dt;
    }
  }
  if (typeof v === 'string') {
    const sDigits = v.trim().replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(sDigits)) {
      const num = parseFloat(sDigits);
      if (num > 18000 && num < 90000) {
        const dt = excelSerialToDate(num);
        return isNaN(dt) ? null : dt;
      }
    }
  }

  const s = String(v).trim();
  if (dayfirst) {
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const d  = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const y  = parseInt(m[3], 10);
      const Y  = y < 100 ? (y + 2000) : y;
      const hh = m[4] ? parseInt(m[4], 10) : 0;
      const mm = m[5] ? parseInt(m[5], 10) : 0;
      const ss = m[6] ? parseInt(m[6], 10) : 0;
      const dt = new Date(Y, mo, d, hh, mm, ss);
      return isNaN(dt) ? null : dt;
    }
  }

  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
};

// Rótulos de período
const yyyymm   = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const quarter  = (d) => `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`;
const semester = (d) => `${d.getFullYear()}-H${d.getMonth()<6?1:2}`;

/* ---------------------------- Agregação comum ----------------------------- */

const sumAbs = (arr) => arr.reduce((acc, x) => acc + (Math.abs(x.qty || 0)), 0);

const groupBy = (arr, keyFn) => {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

const buildPeriod = (arr, labelFn) => {
  const g = groupBy(arr, (x) => x.data && labelFn(x.data));
  return Array.from(g.entries())
    .map(([k, v]) => ({ periodo: k, total_abs: sumAbs(v) }))
    .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
};

/* --------------------------------- XLSX ----------------------------------- */

export async function analyzeBuffer(buffer, config) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Planilha vazia');

  const OP = config.op_codes;

  // Mapeia cabeçalho com tolerância (normalizado)
  const headerMap = {};
  ws.getRow(1).eachCell((cell, col) => {
    const raw = cell?.value?.text ?? cell?.value?.result ?? cell?.value ?? '';
    headerMap[normalize(raw)] = col;
  });

  // Somente colunas necessárias (SEM 'stock')
  const C = config.column_map;
  const requiredKeys = ['cod','date','op','nf','serie','qty','value','party','history'];
  const need = Object.fromEntries(requiredKeys.map((k) => [k, normalize(C[k])]));

  const missing = Object.values(need).filter((n) => !headerMap[n]);
  if (missing.length) {
    console.error('Cabeçalho (normalizado -> índice):', headerMap);
    throw new Error(`Colunas ausentes no cabeçalho (normalizadas): ${missing.join(', ')}`);
  }

  const col = (name) => headerMap[need[name]];

  // Lê as linhas
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const readCell = (idx) => {
      const val = row.getCell(idx)?.value ?? '';
      if (val instanceof Date && !isNaN(val)) return val;
      if (val && typeof val === 'object') {
        return val.text ?? val.result ?? (val.richText?.map(t => t.text).join('')) ?? '';
      }
      return val;
    };

    const rawDate = readCell(col('date'));
    const dt = (rawDate && rawDate.text) ? toDate(rawDate.text, config.dayfirst)
             : (rawDate && rawDate.result) ? toDate(rawDate.result, config.dayfirst)
             : toDate(rawDate, config.dayfirst);

    const op  = toNum(readCell(col('op')));
    const qty = toNum(readCell(col('qty')));

    let tipo = 'DESCONHECIDO';
    if (op === OP.VENDA) tipo = 'VENDA';
    else if (op === OP.COMPRA) tipo = 'COMPRA';
    else if (op === OP.AJUSTE_MAIS) tipo = 'AJUSTE+';
    else if (op === OP.AJUSTE_MENOS) tipo = 'AJUSTE-';
    else if (op === OP.DEVOLUCAO_EMPRESA) tipo = 'DEVOLUCAO_PARA_EMPRESA';
    else if (Number.isFinite(op)) tipo = `OP_${op}`;

    rows.push({
      cod: readCell(col('cod')),
      data: dt,
      op,
      tipo_mov: tipo,
      nf: readCell(col('nf')),
      serie: readCell(col('serie')),
      qty,
      valor: toNum(readCell(col('value'))),
      party: readCell(col('party')),
      historico: readCell(col('history')),
    });
  });

  // Corte automático: só mantém data >= 01/01/2022
  const cut = rows.filter(r => r.data && r.data >= MIN_DATE);

  /* ------------------------------- Agregações ------------------------------ */

  const vendas = cut.filter((r) => r.tipo_mov === 'VENDA');

  // Pivot mensal com todos os tipos (soma de |Qtde|)
  const monthlyPivot = (() => {
    const g = groupBy(cut, (x) => yyyymm(x.data));
    const out = [];
    for (const [mes, list] of g.entries()) {
      const t = groupBy(list, (x) => x.tipo_mov);
      const get = (name) => sumAbs(t.get(name) || []);
      out.push({
        mes,
        VENDA: get('VENDA'),
        COMPRA: get('COMPRA'),
        'AJUSTE+': get('AJUSTE+'),
        'AJUSTE-': get('AJUSTE-'),
        DEVOLUCAO_PARA_EMPRESA: get('DEVOLUCAO_PARA_EMPRESA'),
        TOTAL_ABS: ['VENDA','COMPRA','AJUSTE+','AJUSTE-','DEVOLUCAO_PARA_EMPRESA']
          .reduce((a,k)=>a+get(k),0)
      });
    }
    return out.sort((a,b)=>a.mes.localeCompare(b.mes));
  })();

  // Resumo por tipo
  const resumoPorTipo = (() => {
    const t = groupBy(cut, (x) => x.tipo_mov);
    const tipos = ['VENDA','COMPRA','AJUSTE+','AJUSTE-','DEVOLUCAO_PARA_EMPRESA'];
    const base = tipos.map(k=>{
      const arr = t.get(k)||[];
      return { tipo_mov:k, quantidade_total_abs: sumAbs(arr), linhas: arr.length };
    });
    const outros = Array.from(t.entries())
      .filter(([k])=>!tipos.includes(k))
      .map(([k,arr])=>({ tipo_mov:k, quantidade_total_abs: sumAbs(arr), linhas: arr.length }));
    return [...base, ...outros];
  })();

  // ---- Sazonalidade ----
  const vendasMensaisAbs = buildPeriod(vendas, yyyymm);

  const mean = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const monthlyAvg = mean(vendasMensaisAbs.map(x => x.total_abs)) || 0;

  // índice por mês no tempo (YYYY-MM)
  const seasonality = vendasMensaisAbs.map(x => ({
    periodo: x.periodo,
    vendas: x.total_abs,
    indice: monthlyAvg > 0 ? +(x.total_abs / monthlyAvg).toFixed(3) : null
  }));

  // perfil médio por mês-do-ano (agrega anos)
  const PT_BR_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const byMonth = Array.from({length:12}, (_,i)=>({ mesNum:i+1, mes:PT_BR_MONTHS[i], sum:0, n:0 }));
  for (const m of vendasMensaisAbs) {
    const mm = Number(String(m.periodo).slice(5,7));
    if (mm>=1 && mm<=12) { byMonth[mm-1].sum += m.total_abs; byMonth[mm-1].n += 1; }
  }
  const seasonalityProfile = byMonth.map(b => {
    const avgMonth = b.n ? b.sum / b.n : 0;
    const idx = monthlyAvg>0 ? +(avgMonth / monthlyAvg).toFixed(3) : null;
    return { mesNum: b.mesNum, mes: b.mes, indice: idx, mediaVendasMes: +avgMonth.toFixed(2) };
  });

  /* --------------------------------- Retorno -------------------------------- */

  return {
    columns: { ...config.column_map },
    resumoPorTipo,
    monthlyPivot,
    vendasMensais: vendasMensaisAbs,
    vendasTrimestrais: buildPeriod(vendas, quarter),
    vendasSemestrais: buildPeriod(vendas, semester),
    vendasAnuais: buildPeriod(vendas, (d) => String(d.getFullYear())),
    seasonality,
    seasonalityProfile,
    alerts: {
      vendasSemData: cut.filter((x) => x.tipo_mov === 'VENDA' && !x.data).length, // deve ser 0, pois já filtramos só datas válidas
      vendasQtyZero: cut.filter((x) => x.tipo_mov === 'VENDA' && (!x.qty || x.qty === 0)).length,
    },
    cutoffInfo: {
      minDate: '2022-01-01',
      firstDate: cut.length ? cut.map(r=>r.data).sort((a,b)=>a-b)[0]?.toISOString().slice(0,10) : null,
      lastDate:  cut.length ? cut.map(r=>r.data).sort((a,b)=>b-a)[0]?.toISOString().slice(0,10) : null,
    },
    sample: cut.slice(0, 50),
  };
}

/* --------------------------- Dados colados (JSON) -------------------------- */

export async function analyzePlainRows(plainRows, config) {
  if (!Array.isArray(plainRows) || plainRows.length === 0) {
    throw new Error('Nenhuma linha recebida para análise');
  }

  const OP = config.op_codes;

  // headerMap: normalizado -> chave original no objeto
  const first = plainRows[0];
  const headerMap = {};
  Object.keys(first).forEach((k) => {
    headerMap[normalize(k)] = k;
  });

  const C = config.column_map;
  const requiredKeys = ['cod','date','op','nf','serie','qty','value','party','history'];
  const need = Object.fromEntries(requiredKeys.map((k) => [k, normalize(C[k])]));

  const missing = Object.values(need).filter((n) => !headerMap[n]);
  if (missing.length) {
    throw new Error(`Colunas ausentes nos dados colados (normalizadas): ${missing.join(', ')}`);
  }

  const getKey = (name) => headerMap[need[name]];

  // Converte plainRows -> rows padrão
  const rows = plainRows.map((r) => {
    const rd = (name) => r[getKey(name)];
    const dt = toDate(rd('date'), config.dayfirst);
    const op = toNum(rd('op'));
    const qty = toNum(rd('qty'));

    let tipo = 'DESCONHECIDO';
    if (op === OP.VENDA) tipo = 'VENDA';
    else if (op === OP.COMPRA) tipo = 'COMPRA';
    else if (op === OP.AJUSTE_MAIS) tipo = 'AJUSTE+';
    else if (op === OP.AJUSTE_MENOS) tipo = 'AJUSTE-';
    else if (op === OP.DEVOLUCAO_EMPRESA) tipo = 'DEVOLUCAO_PARA_EMPRESA';
    else if (Number.isFinite(op)) tipo = `OP_${op}`;

    return {
      cod: rd('cod'),
      data: dt,
      op,
      tipo_mov: tipo,
      nf: rd('nf'),
      serie: rd('serie'),
      qty,
      valor: toNum(rd('value')),
      party: rd('party'),
      historico: rd('history'),
    };
  });

  // Corte automático: só mantém data >= 01/01/2022
  const cut = rows.filter(r => r.data && r.data >= MIN_DATE);

  // Agregações
  const vendas = cut.filter((r) => r.tipo_mov === 'VENDA');

  const monthlyPivot = (() => {
    const g = groupBy(cut, (x) => yyyymm(x.data));
    const out = [];
    for (const [mes, list] of g.entries()) {
      const t = groupBy(list, (x) => x.tipo_mov);
      const get = (name) => sumAbs(t.get(name) || []);
      out.push({
        mes,
        VENDA: get('VENDA'),
        COMPRA: get('COMPRA'),
        'AJUSTE+': get('AJUSTE+'),
        'AJUSTE-': get('AJUSTE-'),
        DEVOLUCAO_PARA_EMPRESA: get('DEVOLUCAO_PARA_EMPRESA'),
        TOTAL_ABS: ['VENDA','COMPRA','AJUSTE+','AJUSTE-','DEVOLUCAO_PARA_EMPRESA']
          .reduce((a,k)=>a+get(k),0)
      });
    }
    return out.sort((a,b)=>a.mes.localeCompare(b.mes));
  })();

  const resumoPorTipo = (() => {
    const t = groupBy(cut, (x) => x.tipo_mov);
    const tipos = ['VENDA','COMPRA','AJUSTE+','AJUSTE-','DEVOLUCAO_PARA_EMPRESA'];
    const base = tipos.map(k=>{
      const arr = t.get(k)||[];
      return { tipo_mov:k, quantidade_total_abs: sumAbs(arr), linhas: arr.length };
    });
    const outros = Array.from(t.entries())
      .filter(([k])=>!tipos.includes(k))
      .map(([k,arr])=>({ tipo_mov:k, quantidade_total_abs: sumAbs(arr), linhas: arr.length }));
    return [...base, ...outros];
  })();

  // ---- Sazonalidade ----
  const vendasMensaisAbs = buildPeriod(vendas, yyyymm);

  const mean = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const monthlyAvg = mean(vendasMensaisAbs.map(x => x.total_abs)) || 0;

  const seasonality = vendasMensaisAbs.map(x => ({
    periodo: x.periodo,
    vendas: x.total_abs,
    indice: monthlyAvg > 0 ? +(x.total_abs / monthlyAvg).toFixed(3) : null
  }));

  const PT_BR_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const byMonth = Array.from({length:12}, (_,i)=>({ mesNum:i+1, mes:PT_BR_MONTHS[i], sum:0, n:0 }));
  for (const m of vendasMensaisAbs) {
    const mm = Number(String(m.periodo).slice(5,7));
    if (mm>=1 && mm<=12) { byMonth[mm-1].sum += m.total_abs; byMonth[mm-1].n += 1; }
  }
  const seasonalityProfile = byMonth.map(b => {
    const avgMonth = b.n ? b.sum / b.n : 0;
    const idx = monthlyAvg>0 ? +(avgMonth / monthlyAvg).toFixed(3) : null;
    return { mesNum: b.mesNum, mes: b.mes, indice: idx, mediaVendasMes: +avgMonth.toFixed(2) };
  });

  return {
    columns: { ...config.column_map },
    resumoPorTipo,
    monthlyPivot,
    vendasMensais: vendasMensaisAbs,
    vendasTrimestrais: buildPeriod(vendas, quarter),
    vendasSemestrais: buildPeriod(vendas, semester),
    vendasAnuais: buildPeriod(vendas, (d) => String(d.getFullYear())),
    seasonality,
    seasonalityProfile,
    alerts: {
      vendasSemData: cut.filter((x) => x.tipo_mov === 'VENDA' && !x.data).length,
      vendasQtyZero: cut.filter((x) => x.tipo_mov === 'VENDA' && (!x.qty || x.qty === 0)).length,
    },
    cutoffInfo: {
      minDate: '2022-01-01',
      firstDate: cut.length ? cut.map(r=>r.data).sort((a,b)=>a-b)[0]?.toISOString().slice(0,10) : null,
      lastDate:  cut.length ? cut.map(r=>r.data).sort((a,b)=>b-a)[0]?.toISOString().slice(0,10) : null,
    },
    sample: cut.slice(0, 50),
  };
}
