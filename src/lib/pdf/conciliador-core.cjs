/* eslint-disable */
// @ts-nocheck
/*
 * Núcleo de leitura de extratos do "Conciliador Contvoo", copiado SEM alteração de lógica do artefato
 * (blocos "Núcleo de regras" e "Modo sem IA", que o próprio conciliador descreve como funções puras testadas em node).
 * Contém os leitores por banco (Banrisul, Itaú, BB, Cresol, Sicoob, Sicredi, Caixa, Bradesco, Santander, Nubank, Mercado Pago, PagBank...)
 * e o leitor genérico por colunas. Para ajustar um banco, altere/atualize aqui e rode os testes.
 * Copiado em 29/10/2026 da versão 1793205398-a6ac do artefato.
 */
const Core = (() => {
  const norm = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const r2 = v => Math.round((+v + Number.EPSILON) * 100) / 100;

  /** "1.234,56" | "-1.234,56" | "1.234,56D" | 1234.56 -> número (D/negativo => negativo) */
  function parseValor(x) {
    if (x == null || x === '') return null;
    if (typeof x === 'number') return isFinite(x) ? x : null;
    let s = String(x).trim().replace(/R\$\s*/i, '');
    let neg = /^-|^\(|D\s*$/i.test(s);
    s = s.replace(/[()\sCD*]/gi, '').replace(/^-/, '');
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const v = parseFloat(s);
    return isFinite(v) ? (neg ? -v : v) : null;
  }

  /** Data em vários formatos -> "dd/mm/aaaa" (ou null). anoPadrao completa "dd/mm". */
  function parseData(x, anoPadrao) {
    if (x == null || x === '') return null;
    if (x instanceof Date && !isNaN(x)) return pad(x.getUTCDate()) + '/' + pad(x.getUTCMonth() + 1) + '/' + x.getUTCFullYear();
    if (typeof x === 'number' && x > 20000 && x < 80000) { // serial Excel
      const d = new Date(Date.UTC(1899, 11, 30) + x * 86400000);
      return parseData(d);
    }
    const s = String(x).trim();
    let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
    if (m) {
      let y = m[3] ? +m[3] : anoPadrao; if (!y) return null; if (y < 100) y += 2000;
      return pad(+m[1]) + '/' + pad(+m[2]) + '/' + y;
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return null;
  }
  const pad = n => String(n).padStart(2, '0');
  const dnum = s => { const [d, m, y] = s.split('/').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const mesDe = s => s.slice(6, 10) + '-' + s.slice(3, 5);

  /** Posição do texto na página; páginas giradas (texto na vertical) são "desgiradas": linha = x, coluna = y */
  function pdfItemPos(i) {
    const t = i.transform;
    if (Math.abs(t[0]) < 0.01 && Math.abs(t[1]) > 0.01 && Math.abs(t[3]) < 0.01) return { s: i.str, x: t[5], y: t[1] > 0 ? -t[4] : t[4], w: i.width, h: Math.abs(t[1]) || 8 };
    return { s: i.str, x: t[4], y: t[5], w: i.width, h: Math.abs(t[3]) || 8 };
  }

  /** Itens de texto do pdf.js de uma página -> linhas com espaçamento proporcional (estilo pdftotext -layout) */
  function pdfItemsToLines(items) {
    const its = items.filter(i => i.str && i.str.trim()).map(pdfItemPos);
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const it of its) {
      const L = linhas.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35));
      if (L) L.items.push(it); else linhas.push({ y: it.y, items: [it] });
    }
    linhas.sort((a, b) => b.y - a.y);
    const res = linhas.map(l => {
      l.items.sort((a, b) => a.x - b.x);
      let out = '', end = null;
      for (const it of l.items) {
        if (end != null) {
          const charW = it.w && it.s.length ? it.w / it.s.length : 5;
          const gap = it.x - end;
          out += gap > charW * 1.6 ? ' '.repeat(Math.max(2, Math.min(40, Math.round(gap / charW)))) : (gap > charW * 0.25 ? ' ' : '');
        }
        out += it.s; end = it.x + (it.w || it.s.length * 5);
      }
      return out.replace(/\s+$/, '');
    });
    res.ys = linhas.map(l => l.y); res.xs = linhas.map(l => l.items[0].x);
    return res;
  }

  /** Itens do pdf.js -> linhas de células (separadas por espaços largos), para ler tabelas em PDF. */
  function pdfItemsToCells(items) {
    const its = items.filter(i => i.str && i.str.trim()).map(pdfItemPos);
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const it of its) { const L = linhas.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35)); if (L) L.items.push(it); else linhas.push({ y: it.y, items: [it] }); }
    linhas.sort((a, b) => b.y - a.y);
    return linhas.map(l => {
      l.items.sort((a, b) => a.x - b.x);
      const cel = []; let cur = '', end = null;
      for (const it of l.items) {
        const charW = it.w && it.s.length ? it.w / it.s.length : 5;
        if (end != null && it.x - end > charW * 2.2) { cel.push(cur.trim()); cur = ''; }
        else if (end != null && it.x - end > charW * 0.25) cur += ' ';
        cur += it.s; end = it.x + (it.w || it.s.length * 5);
      }
      cel.push(cur.trim());
      // "R$" / "-R$" solto + valor na célula seguinte viram uma célula só ("-R$ 1.819,40")
      const f = cel.filter(Boolean), m = [];
      for (let i = 0; i < f.length; i++) {
        if (/^[-(]?\s*R\$\s*-?$/.test(f[i]) && i + 1 < f.length && /^[-(]?\d[\d.]*,\d{2}\)?$/.test(f[i + 1])) { m.push(f[i] + ' ' + f[i + 1]); i++; } else m.push(f[i]);
      }
      return m;
    }).filter(r => r.length);
  }

  /** Itens do pdf.js -> linhas com cada célula e sua posição (x inicial e final). Base do JSON do extrato. */
  function pdfLinhasXY(items) {
    const its = items.filter(i => i.str && i.str.trim()).map(pdfItemPos);
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const it of its) { const L = linhas.find(l => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35)); if (L) L.items.push(it); else linhas.push({ y: it.y, items: [it] }); }
    linhas.sort((a, b) => b.y - a.y);
    return linhas.map(l => {
      l.items.sort((a, b) => a.x - b.x);
      const cel = []; let cur = null;
      for (const it of l.items) {
        const charW = it.w && it.s.length ? it.w / it.s.length : 5, fim = it.x + (it.w || it.s.length * 5);
        if (cur && it.x - cur.x1 <= charW * 2.2) { cur.s += (it.x - cur.x1 > charW * 0.25 ? ' ' : '') + it.s; cur.x1 = Math.max(cur.x1, fim); }
        else { cur = { x0: it.x, x1: fim, s: it.s }; cel.push(cur); }
      }
      const m = [];
      for (let i = 0; i < cel.length; i++) {
        const c = cel[i], n = cel[i + 1]; c.s = c.s.replace(/\s+/g, ' ').trim();
        if (n && /^[-(]?\s*R\$\s*-?$/.test(c.s) && /^[-(]?\s*\d[\d.]*,\d{2}/.test(n.s.trim())) { m.push({ x0: c.x0, x1: n.x1, s: c.s + ' ' + n.s.trim() }); i++; }
        else if (c.s) m.push(c);
      }
      return { y: l.y, h: Math.max(...l.items.map(i => i.h || 8)), cs: m };
    }).filter(l => l.cs.length);
  }

  /**
   * Extrato em PDF -> JSON. Acha o cabeçalho da tabela (Data / Histórico / Documento / Crédito / Débito / Saldo…) e põe cada célula
   * na coluna certa pela posição na página. Devolve { colunas, cabecalho:[texto antes da tabela], linhas:[[página, ...valores na ordem das colunas] | {p,t}],
   * tabela: matriz pronta para o leitor de planilhas (data completada com o ano, data repetida nas linhas do mesmo dia, linhas de continuação juntadas) }.
   * Sem cabeçalho reconhecível: linhas = [{p, c:[[x, texto], ...]}] (posição de cada texto) e tabela = null.
   */
  const KW_CAB = /^(data|dt\b|dia\b|hist[oó]rico|descri|lan[cç]amento|docto|documento|doc\b|n[ºo°]\.?\s?doc|cr[eé]dito|d[eé]bito|valor|saldo|entradas?\b|sa[ií]das?\b|favorecido|complemento|detalhe|id da opera|raz[aã]o social|cnpj)/i;
  const VAL_CAB = /valor|cr[eé]dito|d[eé]bito|entrada|sa[ií]da|saldo|lan[cç]amento \(r\$\)/i;
  function extratoJson(paginas) {
    const todo = paginas.flat().map(l => l.cs.map(c => c.s).join(' ')).join('\n');
    const freq = {}; (todo.match(/\b\d{2}\/\d{2}\/(20\d{2})\b/g) || []).forEach(s => { const a = s.slice(-4); freq[a] = (freq[a] || 0) + 1; });
    const ano = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || null;
    const ehCab = l => l.cs.length >= 3 && l.cs.filter(c => KW_CAB.test(c.s.trim())).length >= 3 && l.cs.some(c => /^(data|dt\b|dia\b)/i.test(c.s.trim())) && l.cs.some(c => VAL_CAB.test(c.s));
    const temCab = paginas.some(p => p.some(ehCab));
    const out = { colunas: null, cabecalho: [], linhas: [], tabela: null, ano };
    if (!temCab) {
      paginas.forEach((pg, pi) => pg.forEach(l => out.linhas.push({ p: pi + 1, c: l.cs.map(c => [Math.round(c.x0), c.s]) })));
      return out;
    }
    const nomes = [], meta = []; let cols = null;
    paginas.forEach((pg, pi) => {
      for (const l of pg) {
        if (ehCab(l)) {
          cols = l.cs.map(c => ({ ...c, nome: c.s.trim() }));
          cols.forEach((c, i) => { c.lo = i ? (cols[i - 1].x1 + c.x0) / 2 : -Infinity; c.hi = i < cols.length - 1 ? (c.x1 + cols[i + 1].x0) / 2 : Infinity; if (!nomes.includes(c.nome)) nomes.push(c.nome); });
          continue;
        }
        if (!cols) { out.cabecalho.push(l.cs.map(c => c.s).join('  ')); continue; }
        const v = {};
        for (const c of l.cs) {
          let best = null, bo = -Infinity;
          for (const k of cols) { const ov = Math.min(c.x1, k.hi) - Math.max(c.x0, k.lo); if (ov > bo) { bo = ov; best = k; } }
          v[best.nome] = v[best.nome] ? v[best.nome] + ' ' + c.s : c.s;
        }
        meta.push({ p: pi + 1, y: l.y, h: l.h, v });
      }
    });
    out.colunas = nomes;
    out.cabecalho = out.cabecalho.slice(-40);
    out.linhas = meta.map(m => [m.p, ...nomes.map(n => m.v[n] || '')]);
    // matriz para o leitor de planilhas
    const iD = nomes.findIndex(n => /^(data|dt\b|dia\b)/i.test(n));
    const iH = nomes.findIndex(n => /hist|descri|lan[cç]amento(?! \()|detalhe/i.test(n));
    const iV = nomes.map((n, i) => /valor|cr[eé]dito|d[eé]bito|entrada|sa[ií]da|lan[cç]amento \(r\$\)/i.test(n) && !/saldo/i.test(n) ? i : -1).filter(i => i >= 0);
    if (iD < 0 || !iV.length) return out;
    const iT = iH >= 0 ? iH : nomes.findIndex((n, i) => i !== iD && !iV.includes(i) && !/saldo/i.test(n));
    const comp = d => { const m = d.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/); if (!m) return null; const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : ano; return y ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}` : null; };
    // colunas para o leitor de planilhas: "Docto." vira "Documento" e as linhas de continuação vão para uma coluna "Complemento" própria
    const cabT = nomes.map(n => /^(docto|doc\b|n[ºo°]\.?\s?doc)/i.test(n) ? 'Documento' : n);
    const iC = cabT.length; cabT.push('Complemento');
    const rows = out.cabecalho.map(t => [t]); rows.push(cabT);
    let ult = null, ultMeta = null, ultData = null;
    for (const m of meta) {
      const r = nomes.map(n => m.v[n] || ''); r.push('');
      const md = String(r[iD]).match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b\s*(.*)$/);
      const temValor = iV.some(j => /\d,\d{2}/.test(r[j]));
      const texto = r.filter(Boolean).join(' ');
      if (md && comp(md[1])) {
        r[iD] = comp(md[1]); ultData = r[iD];
        if (md[2] && iT >= 0) r[iT] = (md[2] + ' ' + r[iT]).trim();
      } else if (temValor && ultData) { if (iT >= 0 && r[iD]) r[iT] = (r[iD] + ' ' + r[iT]).trim(); r[iD] = ultData; }
      else if (!temValor) {
        // linha de continuação (favorecido, CPF/CNPJ, descrição do PIX) logo abaixo do lançamento: vai para o histórico dele
        const perto = ult && ultMeta.p === m.p && Math.abs(ultMeta.y - m.y) <= Math.max(14, 1.9 * (m.h || 8));
        if (perto && texto.length < 160 && !/^(saldo|total)/i.test(texto)) { ult[iC] = ult[iC] ? ult[iC] + ' / ' + texto : texto; ultMeta = m; continue; }
      }
      rows.push(r);
      if (r[iD] && temValor) { ult = r; ultMeta = m; }
    }
    out.tabela = rows;
    // saldo final: o da coluna Saldo na linha mais recente (o extrato pode vir do mais novo para o mais antigo)
    const iS = nomes.findIndex(n => /saldo/i.test(n));
    if (iS >= 0) {
      const cs = rows.slice(out.cabecalho.length + 1).filter(r => r[iD] && /\d,\d{2}/.test(r[iS]));
      if (cs.length) { const dn = d => { const [a, b, c] = d.split('/'); return +c * 10000 + +b * 100 + +a; }; const desc = dn(cs[0][iD]) > dn(cs[cs.length - 1][iD]); const v = parseValor((desc ? cs[0] : cs[cs.length - 1])[iS]); if (v != null) out.saldoFinal = r2(v); }
    }
    return out;
  }

  /** Relatório "Relacionamento de contas com o plano referencial" (Domínio) ou lista código/classificação/nome -> contas */
  function parsePlano(linhas) {
    const contas = [], vistos = new Set();
    for (let raw of linhas) {
      const l = String(raw).replace(/\t/g, '  ');
      if (/^\s*Referencial/i.test(l)) continue;
      const m = l.match(/(?:^|\s)(\d{1,6})\s+(\d(?:\.\d{1,5}){0,6})\s+((?!\d(?:\.\d{1,5})+\s)(?!\d+\s{2,})(?!\d+\s*$)[A-Za-zÀ-ÿ0-9(\-\[+&].*?)\s*(?:\d{2}\/\d{2}\/\d{4}.*)?$/);
      if (!m) continue;
      const cod = +m[1], classif = m[2], nome = m[3].replace(/\s{2,}.*$/, '').trim();
      if (!nome || /^(Sint|Anal)/i.test(nome) || vistos.has(cod)) continue;
      vistos.add(cod); contas.push([cod, classif, nome]);
    }
    return contas;
  }
  const isAnalitica = c => c[1].split('.').length >= 5;

  /** Procura no plano a conta bancária cujo nome contém o número da conta do extrato */
  function contaBancoNoPlano(contas, contaExtrato) {
    const dig = String(contaExtrato || '').replace(/\D/g, '').replace(/^0+/, '');
    if (dig.length < 4) return null;
    for (const c of contas) {
      if (!/^1\.1\.1\./.test(c[1]) || !isAnalitica(c)) continue;
      const nums = (c[2].match(/\d[\d.\-]{3,}/g) || []).map(n => n.replace(/\D/g, '').replace(/^0+/, ''));
      if (nums.some(n => n.length >= 4 && (n === dig || n.endsWith(dig) || dig.endsWith(n)))) return c;
    }
    return null;
  }

  /** Linhas da planilha do cliente a partir do mapeamento de colunas (detectado pelo Claude) */
  function extrairPlanilha(rows, map, anoPadrao) {
    const out = []; let ultimaData = null;
    const col = k => (map.colunas && map.colunas[k] != null && map.colunas[k] !== -1) ? map.colunas[k] : null;
    for (let i = (map.linhaCabecalho ?? 0) + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      let d = col('data') != null ? parseData(r[col('data')], anoPadrao) : null;
      if (!d && map.dataContinua) d = ultimaData;
      if (d) ultimaData = d;
      let v = null;
      if (col('valor') != null) v = parseValor(r[col('valor')]);
      else {
        const e = col('entrada') != null ? parseValor(r[col('entrada')]) : null;
        const s = col('saida') != null ? parseValor(r[col('saida')]) : null;
        if (e) v = Math.abs(e); else if (s) v = -Math.abs(s);
      }
      if (v != null && col('dc') != null) {
        const t = norm(String(r[col('dc')] ?? '')).toLowerCase();
        if (/^(s|d|saida|debito|pagamento|despesa)\b/.test(t)) v = -Math.abs(v); else if (/^(e|c|entrada|credito|recebimento|receita)\b/.test(t)) v = Math.abs(v);
      }
      if ((!d && !map.semData) || v == null || Math.abs(v) < 0.005) continue;
      if (!d) d = '';
      const txt = k => col(k) != null && r[col(k)] != null ? String(r[col(k)]).trim() : '';
      out.push({ i: out.length, data: d, valor: r2(v), categoria: txt('categoria'), descricao: txt('descricao'),
                 complemento: txt('complemento'), documento: txt('documento').replace(/\.0$/, ''), banco: txt('banco') });
    }
    return out;
  }

  /** Confere: saldo anterior + créditos - débitos = saldo final */
  function conferirSaldo(ext) {
    const cr = r2(ext.lancamentos.filter(t => t.tipo === 'C').reduce((a, t) => a + t.valor, 0));
    const db = r2(ext.lancamentos.filter(t => t.tipo === 'D').reduce((a, t) => a + t.valor, 0));
    const calc = ext.saldoAnterior == null ? null : r2(ext.saldoAnterior + cr - db);
    let ok = calc != null && ext.saldoFinal != null && Math.abs(calc - ext.saldoFinal) < 0.015;
    let dif = calc != null && ext.saldoFinal != null ? r2(calc - ext.saldoFinal) : null;
    // quando o extrato traz os totais de entradas/saídas, eles também têm de bater com o que foi lido
    if (ext.totais && (Math.abs(ext.totais.cred - cr) > 0.015 || Math.abs(ext.totais.deb - db) > 0.015)) { ok = false; if (!dif) dif = r2((cr - ext.totais.cred) - (db - ext.totais.deb)) || 0.01; }
    if (ext.divergencias > 0) { ok = false; if (!dif) dif = 0.01; }
    return { creditos: cr, debitos: db, saldoCalculado: calc, confere: ok, diferenca: dif, divergencias: ext.divergencias || 0 };
  }

  /* ---------- casamento extrato x cliente (níveis 1-3, agrupamentos, outro mês, juros de atraso) ---------- */
  function combos(arr, k, alvo, limite = 22) {
    if (arr.length > limite && k > 3) return null;
    const idx = [];
    const rec = (start, soma) => {
      if (idx.length === k) return Math.abs(soma - alvo) < 0.005 ? idx.slice() : null;
      for (let i = start; i < arr.length; i++) {
        idx.push(i); const r = rec(i + 1, soma + arr[i].valorAbs); if (r) return r; idx.pop();
      }
      return null;
    };
    const r = rec(0, 0); return r ? r.map(i => arr[i]) : null;
  }

  /** O nome escrito pelo cliente tem uma palavra (3+ letras) igual ou que começa igual à do favorecido do extrato ("ROSE" = "ROSELAINE"). */
  const PAL_VAZIA = /^(LTDA|EIRELI|EPP|DOS|DAS|PIX|PAGAMENTO|RECEBIMENTO|LIQUIDACAO|BOLETO|DEB|CRED|DEBITO|CREDITO|DOC|TED|SICREDI)$/;
  function nomeCompat(t, r) {
    const pal = s => norm(s).replace(/[^A-Z ]/g, ' ').split(' ').filter(w => w.length >= 3 && !PAL_VAZIA.test(w));
    const a = pal((t.historico || '') + ' ' + (t.complemento || '')), b = pal([r.descricao, r.complemento, r.categoria].filter(Boolean).join(' '));
    return a.some(x => b.some(y => x === y || (y.length >= 4 && x.startsWith(y)) || (x.length >= 4 && y.startsWith(x))));
  }

  /**
   * CPF/CNPJ (ou nº de contrato) que o EXTRATO mostra e que está escrito no nome de uma conta do plano.
   * Aceita CPF/CNPJ completo e a raiz de 8 dígitos do CNPJ de MEI ("49.133.181 DEBORA SOFIA"). Devolve a conta ou null.
   */
  function contaPorDocumento(contas, texto) {
    const t = String(texto || '');
    const docs = new Set((t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\b\d{14}\b|\b\d{11}\b/g) || []).map(x => x.replace(/\D/g, '')));
    const contratos = (t.match(/\bC\d{8,}\b/g) || []);
    if (!docs.size && !contratos.length) return null;
    const achou = [];
    for (const c of contas) {
      if (!isAnalitica(c) || /^1\.1\.1\.|^1\.1\.3\.05\./.test(c[1])) continue; // bancos e adiantamentos não entram
      const nums = (c[2].match(/\d[\d.\-\/]{6,}\d/g) || []).map(x => x.replace(/\D/g, '')).filter(x => [8, 11, 14].includes(x.length));
      const hitDoc = nums.some(n => docs.has(n) || (n.length === 8 && [...docs].some(d => d.length === 14 && d.startsWith(n))));
      const hitCt = contratos.some(k => (c[2].match(/C\d{8,}/g) || []).some(x => x.startsWith(k) || k.startsWith(x)));
      if (hitDoc || hitCt) achou.push(c);
    }
    return achou.length === 1 ? achou[0] : null;
  }

  /** tx: [{id, data, valor(+), tipo}] de todos os bancos/meses; cli: [{i, data, valor(±)}]. Muta tx[].match */
  function casar(tx, cliTodos) {
    const cli = cliTodos.filter(r => r.data); // linhas sem data (planilha sem coluna de data) são casadas no fim, só por valor e nome
    const usados = new Set();
    tx.forEach(t => { t.match = null; t.nivel = null; t.grupo = null; t.juros = null; t.obs = null; });
    const sv = t => t.tipo === 'C' ? t.valor : -t.valor;
    const dd = (a, b) => Math.abs(dnum(a) - dnum(b));
    // 1:1
    for (const [tol, lvl] of [[0, 1], [3, 2], [7, 3]]) {
      for (const t of tx) {
        if (t.match) continue;
        // mesmo valor e data: entre vários candidatos, prefere a linha do cliente cujo nome é compatível com o favorecido do extrato
        const cs = cli.filter(r => !usados.has(r.i) && Math.abs(r.valor - sv(t)) < 0.005 && dd(r.data, t.data) <= tol);
        const r = cs.find(r => nomeCompat(t, r)) || cs[0];
        if (r) { t.match = [r.i]; t.nivel = lvl; usados.add(r.i); if (mesDe(r.data) !== mesDe(t.data)) t.obs = `Cliente datou em ${r.data}; banco debitou em ${t.data}.`; }
      }
    }
    // N extrato : 1 cliente
    for (const r of cli) {
      if (usados.has(r.i)) continue;
      const cand = tx.filter(t => !t.match && (t.tipo === 'C') === (r.valor > 0) && dd(r.data, t.data) <= 3).map(t => ({ t, valorAbs: t.valor }));
      for (let k = 2; k <= 4; k++) {
        const f = combos(cand, k, Math.abs(r.valor));
        if (f) { f.forEach(x => { x.t.match = [r.i]; x.t.nivel = 2; x.t.grupo = f.length; x.t.obs = `Cliente lançou em uma linha (R$ ${fmt(Math.abs(r.valor))}); o banco movimentou em ${f.length} partes.`; }); usados.add(r.i); break; }
      }
    }
    // 1 extrato : N cliente
    for (const t of tx) {
      if (t.match) continue;
      const cand = cli.filter(r => !usados.has(r.i) && (r.valor > 0) === (t.tipo === 'C') && dd(r.data, t.data) <= 3).map(r => ({ r, valorAbs: Math.abs(r.valor) }));
      for (let k = 2; k <= 4; k++) {
        const f = combos(cand, k, t.valor);
        if (f) { t.match = f.map(x => x.r.i); t.nivel = 2; t.obs = `Um movimento do banco pagou ${f.length} lançamentos do cliente.`; f.forEach(x => usados.add(x.r.i)); break; }
      }
    }
    // atraso (juros) ou diferença de centavos, mesmo dia ±1, até 3%
    for (const r of cli) {
      if (usados.has(r.i)) continue;
      const v = Math.abs(r.valor);
      const t = tx.find(t => !t.match && (t.tipo === 'C') === (r.valor > 0) && dd(r.data, t.data) <= 1 && Math.abs(t.valor - v) <= Math.max(0.10, 0.03 * v));
      if (t) {
        const dif = r2(t.valor - v);
        t.match = [r.i]; t.nivel = 2; usados.add(r.i);
        if (dif > 0.10 && t.tipo === 'D') { t.juros = dif; t.obs = `Cliente informou R$ ${fmt(v)}; banco debitou R$ ${fmt(t.valor)} — diferença de R$ ${fmt(dif)} lançada em JUROS (pagamento com atraso).`; }
        else t.obs = `Cliente informou R$ ${fmt(v)}; banco ${t.tipo === 'D' ? 'debitou' : 'creditou'} R$ ${fmt(t.valor)} (diferença de centavos) — valor do banco mantido.`;
      }
    }
    // último recurso: mesmo valor e mesmo sentido, único candidato livre até 15 dias de distância (cliente datou em outro dia)
    for (const r of cli) {
      if (usados.has(r.i)) continue;
      const v = Math.abs(r.valor);
      const cand = tx.filter(t => !t.match && (t.tipo === 'C') === (r.valor > 0) && Math.abs(t.valor - v) < 0.005 && dd(r.data, t.data) <= 15);
      if (!cand.length) continue;
      cand.sort((a, b) => dd(r.data, a.data) - dd(r.data, b.data));
      if (cand.length > 1 && dd(r.data, cand[1].data) === dd(r.data, cand[0].data)) continue;
      const t = cand[0]; t.match = [r.i]; t.nivel = 3; usados.add(r.i);
      t.obs = `Cliente datou em ${r.data}; banco ${t.tipo === 'D' ? 'debitou' : 'creditou'} em ${t.data} (mesmo valor).`;
    }
    // planilha sem data: casa pelo valor (mesmo sentido). Só aceita se houver um único candidato ou se o nome do cliente aparece no extrato.
    const semData = cliTodos.filter(r => !r.data);
    if (semData.length) {
      const palavras = r => [...new Set(norm([r.descricao, r.complemento, r.categoria].filter(Boolean).join(' ')).replace(/[^A-Z ]/g, ' ').split(' ').filter(w => w.length > 3 && !GENERICAS.test(w)))];
      const txtDe = t => norm(t.historico + ' ' + t.complemento);
      for (const r of semData) {
        const v = Math.abs(r.valor);
        const cand = tx.filter(t => !t.match && (t.tipo === 'C') === (r.valor > 0) && Math.abs(t.valor - v) < 0.005);
        if (!cand.length) continue;
        const pal = palavras(r);
        const nome = cand.filter(t => { const x = txtDe(t); return pal.some(w => x.includes(w)); });
        const outrasIguais = semData.filter(o => !usados.has(o.i) && o !== r && Math.abs(Math.abs(o.valor) - v) < 0.005 && (o.valor > 0) === (r.valor > 0)).length;
        const t = nome.length === 1 ? nome[0] : (!nome.length && cand.length === 1 && !outrasIguais ? cand[0] : null);
        if (!t) continue;
        t.match = [r.i]; t.nivel = 3; usados.add(r.i);
        t.obs = `Planilha do cliente sem data: casado só pelo valor (R$ ${fmt(v)})${nome.length === 1 ? ' e pelo nome' : ''}.`;
      }
    }
    // dica para o que ficou sem par: existe valor igual no extrato?
    const pend = cliTodos.filter(r => !usados.has(r.i));
    pend.forEach(r => {
      const v = Math.abs(r.valor);
      const iguais = tx.filter(t => Math.abs(t.valor - v) < 0.005);
      if (!iguais.length) { r.dica = 'Nenhum lançamento de ' + fmt(v) + ' no extrato.'; return; }
      const t = r.data ? iguais.sort((a, b) => dd(r.data, a.data) - dd(r.data, b.data))[0] : iguais[0];
      const mesmoSentido = (t.tipo === 'C') === (r.valor > 0);
      r.dica = `Extrato tem ${fmt(v)} em ${t.data} (${t.tipo === 'C' ? 'crédito' : 'débito'})` + (!mesmoSentido ? ' — sentido oposto ao da planilha.' : t.match ? ' — já conciliado com outra linha da planilha.' : (r.data ? ` — ${dd(r.data, t.data)} dias de diferença.` : ` — a planilha não tem data${iguais.length > 1 ? ' e há mais de um lançamento com esse valor' : ''}.`));
    });
    return { pendentesCliente: pend, casados: tx.filter(t => t.match).length };
  }

  /* ---------- casamento extrato x notas fiscais recebidas (SIEG) ---------- */
  const GENERICAS = /^(LTDA|EIRELI|COMERCIO|INDUSTRIA|COMERCIAL|SERVICOS|DISTRIBUIDORA|DISTRIB|MATERIAIS|MATERIAL|PARA|CONSTRUCAO|CONSTRUCOES|EMPRESA|BRASIL|BRASILEIRA|EQUIPAMENTOS|PRODUTOS|IMPORTACAO|EXPORTACAO|REPRESENTACOES|COMPONENTES|ELETRICOS|ELETRICA|ELETRONICOS|TRANSPORTES|AUTO|PECAS|MATRIZ|FILIAL|IND)$/;
  const digitos = s => String(s || '').replace(/\D/g, '');
  const palavrasForn = n => [...new Set(norm(n.razao + ' ' + n.fantasia).replace(/[^A-Z ]/g, ' ').split(' ').filter(w => w.length > 3 && !GENERICAS.test(w)))];
  const nomeForn = n => (n.razao || n.fantasia || '').trim();
  /**
   * Casa débitos do extrato com NF-e do SIEG. Muta tx[].nf.
   * notas: [{i, num, valor, data, cnpj, razao, fantasia}]. O nome do fornecedor é sempre a Razão Social do emitente.
   * Ordem: (A) valor igual, (B) um pagamento para várias notas, (C) nota paga em parcelas iguais, (D) valor com juros/desconto
   * e (E) só o fornecedor (CNPJ/nome no extrato), sem nota.
   */
  function casarNotas(tx, todasNotas, antes = 0, depois = 120) {
    // Regra de vencimento: o SIEG não traz vencimento, então a data de emissão é o piso (pagamento >= emissão; antes = 0).
    // CT-e só do relatório Excel (sem valor) entra só na identificação da transportadora pelo CNPJ (etapa E); com o XML (valor do frete) casa por valor como as notas.
    const notas = todasNotas.filter(n => n.valor != null && n.valor > 0);
    const docNome = n => ({ CTE: 'CT-e', NFSE: 'NFS-e', NFCE: 'NFC-e' })[n.tipo] || 'NF-e';
    const usadas = new Set();
    tx.forEach(t => { t.nf = null; t.nfSug = null; });
    const INTERNO = /IOF|JUROS|TARIF|PACOTE|CESTA|SEGURO|EMPR[EÉ]ST|RDC|RESGATE|APLIC|ADIANT|SALDO|ENCARGO|CAPITALIZ|COTA|MENSALIDADE|ANUIDADE|FGTS|\bGPS\b|DARF|\bDAS\b|IMPOSTO|SALARIO|FOLHA|PENS|CONVENIO|CONV\.|CNV|TRIBUT|DEB\.?\s?CONV/;
    const deb = tx.filter(t => t.tipo === 'D' && !INTERNO.test(norm(t.historico)));
    const dias = (n, t) => dnum(t.data) - dnum(n.data);
    const naJanela = (n, t, extra = 0) => { const d = dias(n, t); return d >= -antes && d <= depois + extra; };
    const info = t => {
      const txt = norm(t.historico + ' ' + t.complemento);
      const nums = new Set((txt.match(/\d{3,}/g) || []).map(x => x.replace(/^0+/, '')));
      // texto da planilha do cliente (ex.: "BOLETO PAGO SETA COMERCI - DOC NF Nº 3224 PARC 002"): o nº da NF só vale junto com uma palavra do nome do fornecedor
      const ctxt = t.cli ? norm([t.cli.descricao, t.cli.complemento, t.cli.documento, t.cli.categoria].filter(Boolean).join(' ')) : '';
      const cnums = new Set((ctxt.match(/\d{3,}/g) || []).map(x => x.replace(/^0+/, '')));
      const parc = (ctxt.match(/PARC\w*\s*0*(\d+)/) || [])[1] || null;
      return { txt: txt + ' ' + ctxt, compact: (txt + ctxt).replace(/[^A-Z]/g, ''), cnpj: idDoc(t.complemento), nums, cnums, parc };
    };
    const infos = new Map(deb.map(t => [t, info(t)]));
    const forte = (n, i) => {
      if (i.cnpj && i.cnpj === digitos(n.cnpj)) return true;
      const nn = String(n.num || '').replace(/^0+/, '');
      if (nn.length >= 4 && i.nums.has(nn)) return true;
      const pal = palavrasForn(n);
      if (nn.length >= 4 && i.cnums.has(nn) && pal.some(w => i.txt.includes(w) || i.compact.includes(w))) return true; const bate = w => i.txt.includes(w) || (w.length >= 6 && i.compact.includes(w)); // "SUPER PRO" no extrato = "SUPERPRO" na nota
      const hit = pal.filter(bate).length;
      if (pal.length && pal[0].length >= 6 && bate(pal[0])) return true; // a marca (1ª palavra da razão social) aparece no extrato
      return hit >= 2 || (hit === 1 && pal.length === 1 && pal[0].length >= 5);
    };
    const marca = (t, ns, conf, obs, juros, extra = {}) => {
      ns.forEach(n => usadas.add(n.i));
      const n0 = ns[0];
      t.nf = { chaves: ns.map(n => n.i), num: ns.map(n => n.num).join(', '), cnpj: digitos(n0.cnpj), forn: nomeForn(n0), data: n0.data, conf, obs, cte: n0.tipo === 'CTE', ...extra };
      t.nfSug = null;
      if (juros) t.juros = juros;
    };
    // sugestão: só valor/data bateram, nada do extrato lembra a nota. NÃO classifica, NÃO muda complemento, NÃO entra no dicionário.
    const sugere = (t, ns, obs) => {
      if (t.nf || t.nfSug) return;
      const n0 = ns[0];
      t.nfSug = { chaves: ns.map(n => n.i), num: ns.map(n => n.num).join(', '), cnpj: digitos(n0.cnpj), forn: nomeForn(n0), data: n0.data, obs: 'Sugestão (não aplicada): ' + obs };
    };
    const livre = t => !t.nf;
    const ordenados = deb.slice().sort((a, b) => dnum(a.data) - dnum(b.data));
    // (A) valor igual. Fase 1: confirma só com vínculo real (CNPJ, nº da NF ou nome do fornecedor no extrato)
    for (const t of ordenados.filter(livre)) {
      const i = infos.get(t);
      const cand = notas.filter(n => !usadas.has(n.i) && Math.abs(n.valor - t.valor) < 0.005 && dias(n, t) >= -antes && dias(n, t) <= 400 && forte(n, i));
      if (!cand.length) continue;
      cand.sort((a, b) => Math.abs(dias(a, t) - 25) - Math.abs(dias(b, t) - 25));
      const n = cand[0];
      marca(t, [n], 'A', `${docNome(n)} ${n.num} de ${nomeForn(n)} (emitida em ${n.data}).`);
    }
    // (A) Fase 2: só o valor bate -> sugestão
    for (const t of ordenados.filter(t => livre(t) && !t.match)) {
      const todos = notas.filter(n => !usadas.has(n.i) && Math.abs(n.valor - t.valor) < 0.005 && dias(n, t) >= -antes && dias(n, t) <= 400);
      const centavos = Math.abs(t.valor * 100 - Math.round(t.valor) * 100) > 0.5;
      const cand = todos.filter(n => dias(n, t) <= depois || (todos.length === 1 && centavos && dias(n, t) <= 180));
      if (!cand.length) continue;
      cand.sort((a, b) => Math.abs(dias(a, t) - 25) - Math.abs(dias(b, t) - 25));
      const n = cand[0];
      // valor muito quebrado (centavos sem zero no fim, ex.: 351,48): é difícil coincidir por acaso, então confirma pela melhor data; valor redondo só sugere
      const cent = Math.round(Math.abs(t.valor) * 100) % 100;
      const ehBoleto = /BOLETO|TITULO|\bTIT\b|COMPE|COBRANCA|\bDOC\b/.test(norm(t.historico));
      const quebrado = t.valor >= 10 && (ehBoleto ? (cent !== 0 && cent !== 50) : cent % 10 !== 0); // boleto: só 00 e 50 são redondos
      if (quebrado && dias(n, t) <= depois) {
        marca(t, [n], 'M', `Valor quebrado (R$ ${fmt(t.valor)}) igual ao da ${docNome(n)} ${n.num} de ${nomeForn(n)} (emitida em ${n.data}, ${dias(n, t)} dia(s) depois)${cand.length > 1 ? ' — há outras notas com o mesmo valor; escolhida a de data mais coerente' : ''}; a descrição do extrato não cita o fornecedor, confirme.`);
        continue;
      }
      sugere(t, [n], `valor igual ao da ${docNome(n)} ${n.num} de ${nomeForn(n)} (emitida em ${n.data})${cand.length > 1 ? ' — há outras notas com o mesmo valor' : ''}; a descrição do extrato não tem relação com o fornecedor, confirme.`);
    }
    // (B) um pagamento para várias notas do mesmo fornecedor
    for (const t of deb.filter(t => livre(t) && !t.match)) {
      const i = infos.get(t);
      const porForn = new Map();
      notas.filter(n => !usadas.has(n.i) && naJanela(n, t, 30) && n.valor < t.valor).forEach(n => { const k = digitos(n.cnpj); (porForn.get(k) || porForn.set(k, []).get(k)).push(n); });
      for (const arr of porForn.values()) {
        if (arr.length < 2 || arr.length > 24) continue;
        const cand = arr.map(n => ({ n, valorAbs: n.valor }));
        for (let k = 2; k <= 5; k++) {
          const f = combos(cand, k, t.valor);
          if (f) {
            const ns = f.map(x => x.n);
            if (forte(ns[0], i)) marca(t, ns, 'A', `Pagou ${ns.length} ${docNome(ns[0])} de ${nomeForn(ns[0])}: ${ns.map(n => n.num).join(', ')}.`);
            else sugere(t, ns, `a soma de ${ns.length} ${docNome(ns[0])} de ${nomeForn(ns[0])} (${ns.map(n => n.num).join(', ')}) é igual ao valor; a descrição do extrato não tem relação com o fornecedor, confirme.`);
            break;
          }
        }
        if (t.nf) break;
      }
    }
    // (C) nota paga em parcelas iguais (2 a 12 boletos, de ~30 em 30 dias)
    for (const n of notas.filter(n => !usadas.has(n.i) && n.valor >= 20).sort((a, b) => b.valor - a.valor)) {
      let feito = false;
      for (let q = 2; q <= 6 && !feito; q++) {
        const p = r2(n.valor / q);
        const cand = deb.filter(t => livre(t) && !t.match && Math.abs(t.valor - p) <= 0.02 && dias(n, t) >= -antes && dias(n, t) <= depois + 35 * (q - 1)).sort((a, b) => dnum(a.data) - dnum(b.data));
        if (cand.length < q) continue;
        for (let s0 = 0; s0 < cand.length && !feito; s0++) {
          if (dias(n, cand[s0]) > depois) break;
          const cadeia = [cand[s0]];
          for (const t of cand.slice(s0 + 1)) { const d = dnum(t.data) - dnum(cadeia[cadeia.length - 1].data); if (d >= 20 && d <= 45) cadeia.push(t); if (cadeia.length === q) break; }
          if (cadeia.length === q && Math.abs(cadeia.reduce((a, t) => a + t.valor, 0) - n.valor) <= 0.05) {
            const f = cadeia.some(t => forte(n, infos.get(t)));
            if (f) cadeia.forEach((t, k) => marca(t, [n], 'A', `Parcela ${k + 1}/${q} da ${docNome(n)} ${n.num} de ${nomeForn(n)} (emitida em ${n.data}, R$ ${fmt(n.valor)}).`, null, { parcela: `${k + 1}/${q}` }));
            else if (!cadeia.some(t => t.nfSug)) cadeia.forEach((t, k) => sugere(t, [n], `parcela ${k + 1}/${q} da ${docNome(n)} ${n.num} de ${nomeForn(n)} (emitida em ${n.data}, R$ ${fmt(n.valor)}); a descrição do extrato não tem relação com o fornecedor, confirme.`));
            feito = true;
          }
        }
      }
    }
    // (C2) achou o fornecedor (nome/CNPJ/nº da NF no extrato) mas o valor não é o da nota: testa se é 1/2 ... 1/6 da nota (parcelada)
    const parceladas = new Set();
    for (const t of deb.filter(t => livre(t))) {
      const i = infos.get(t);
      let melhor = null;
      for (const n of notas) {
        if (usadas.has(n.i) || dias(n, t) < -antes || dias(n, t) > 400 || n.valor <= t.valor || !forte(n, i)) continue;
        for (let q = 2; q <= 6; q++) {
          if (Math.abs(t.valor - n.valor / q) <= 0.03) { if (!melhor || q < melhor.q || (q === melhor.q && dias(n, t) < dias(melhor.n, t))) melhor = { n, q }; break; }
        }
      }
      if (!melhor) continue;
      const { n, q } = melhor;
      parceladas.add(n.i);
      t.nf = { chaves: [n.i], num: n.num, cnpj: digitos(n.cnpj), forn: nomeForn(n), data: n.data, conf: 'A', parcela: `?/${q}`, obs: `Valor = 1/${q} da ${docNome(n)} ${n.num} de ${nomeForn(n)} (R$ ${fmt(n.valor)}, emitida em ${n.data}): provável parcela de ${q}; confira as demais.` };
      t.nfSug = null;
    }
    // (D) valor um pouco diferente (juros/multa ou desconto), só com nome/CNPJ/número batendo
    for (const t of deb.filter(t => livre(t) && !t.match)) {
      const i = infos.get(t);
      const cand = notas.filter(n => !usadas.has(n.i) && naJanela(n, t, 30) && Math.abs(t.valor - n.valor) > 0.005 && Math.abs(t.valor - n.valor) <= Math.max(0.10, 0.03 * n.valor) && forte(n, i));
      if (cand.length === 1) {
        const n = cand[0], dif = r2(t.valor - n.valor);
        if (dif > 0.10) marca(t, [n], 'M', `${docNome(n)} ${n.num} de ${nomeForn(n)}: R$ ${fmt(n.valor)}; banco debitou R$ ${fmt(t.valor)} — diferença de R$ ${fmt(dif)} lançada em JUROS.`, dif);
        else marca(t, [n], 'M', `${docNome(n)} ${n.num} de ${nomeForn(n)}: R$ ${fmt(n.valor)}; banco debitou R$ ${fmt(t.valor)} (desconto/diferença de R$ ${fmt(Math.abs(dif))}) — valor do banco mantido.`);
      }
    }
    // (E) só o fornecedor: CNPJ ou nome do extrato consta no SIEG, mas nenhum valor bate
    const porCnpj = new Map(); todasNotas.forEach(n => { const k = digitos(n.cnpj); if (k && !porCnpj.has(k)) porCnpj.set(k, n); });
    const porRaiz = new Map(); todasNotas.forEach(n => { const k = digitos(n.cnpj).slice(0, 8); if (k.length === 8 && !porRaiz.has(k)) porRaiz.set(k, n); });
    let soForn = 0;
    for (const t of deb.filter(livre)) {
      const i = infos.get(t); let n = null, por = '';
      if (i.cnpj && porCnpj.has(i.cnpj)) { n = porCnpj.get(i.cnpj); por = 'CNPJ'; }
      else if (i.cnpj && i.cnpj.length === 14 && porRaiz.has(i.cnpj.slice(0, 8))) { n = porRaiz.get(i.cnpj.slice(0, 8)); por = 'CNPJ (mesma empresa, outra filial)'; }
      else {
        const ach = [...porCnpj.values()].filter(x => { const p = palavrasForn(x); return p.length >= 2 && p.filter(w => i.txt.includes(w)).length >= 2; });
        if (ach.length === 1) { n = ach[0]; por = 'nome'; }
      }
      let num = '', obsParc = '';
      if (!n) {
        // o número da NF aparece no extrato/planilha do cliente e uma nota do SIEG tem esse número e o nome do fornecedor bate (valor diferente: parcela, juros)
        const porNum = notas.filter(x => { const nn = String(x.num || '').replace(/^0+/, ''); return nn.length >= 4 && forte(x, i) && (i.nums.has(nn) || i.cnums.has(nn)); });
        if (porNum.length === 1) { n = porNum[0]; por = 'número da NF'; num = n.num; obsParc = i.parc ? ` Parcela ${i.parc} (valor do banco R$ ${fmt(t.valor)}; NF de R$ ${fmt(n.valor)}).` : ` Valor do banco R$ ${fmt(t.valor)}; NF de R$ ${fmt(n.valor)}.`; }
      }
      if (!n) continue;
      const ehCte = n.tipo === 'CTE';
      t.nf = { chaves: [], num, cnpj: digitos(n.cnpj), forn: nomeForn(n), data: '', conf: 'M', soForn: true, cte: ehCte, porDoc: /^CNPJ/.test(por), obs: ehCte ? (n.valor != null ? `Transportadora identificada pelo ${por} no extrato (CT-e: ${nomeForn(n)}), mas nenhum CT-e lido do XML tem este valor (pode ser fatura de vários CT-e) — confira o frete.` : `Transportadora identificada pelo ${por} no extrato (CT-e do SIEG: ${nomeForn(n)}); o relatório do SIEG não traz o valor do CT-e — envie os XMLs para casar pelo valor.`) : `Fornecedor identificado pelo ${por} no extrato (consta no SIEG: ${nomeForn(n)}), mas nenhuma NF-e tem este valor; confira a nota.${obsParc}` };
      soForn++;
    }
    const cteVistos = new Set(deb.filter(t => t.nf && t.nf.cte).map(t => t.nf.cnpj));
    return { pendentesNotas: todasNotas.filter(n => n.valor == null ? !cteVistos.has(digitos(n.cnpj)) : (!usadas.has(n.i) && !parceladas.has(n.i))), casados: deb.filter(t => t.nf && !t.nf.soForn).length, soFornecedor: soForn, sugeridos: deb.filter(t => t.nfSug && !t.nf).length };
  }

  /**
   * Casa pagamentos (D) / recebimentos (C) do extrato com as parcelas de um relatório de contas a pagar/receber do cliente.
   * titulos: [{i, tipo:'P'|'R', parte, doc, emissao, venc, valor, pago, parc, np}]. Valor igual + vencimento próximo; só confirma (Alta) com
   * o nº do documento ou ao menos 2 palavras do nome no extrato/planilha do cliente. Não sobrescreve nota do SIEG já confirmada. Muta tx[].nf.
   */
  function casarTitulos(tx, titulos) {
    const usados = new Set(); let casados = 0, sugeridos = 0;
    const pal = n => [...new Set(norm(n.parte).replace(/[^A-Z ]/g, ' ').split(' ').filter(w => w.length > 3 && !GENERICAS.test(w)))];
    const info = t => {
      const txt = norm([t.historico, t.complemento, t.cli && t.cli.descricao, t.cli && t.cli.complemento, t.cli && t.cli.documento, t.cli && t.cli.categoria].filter(Boolean).join(' '));
      return { txt, compact: txt.replace(/[^A-Z]/g, ''), nums: new Set((txt.match(/\d{3,}/g) || []).map(x => x.replace(/^0+/, ''))) };
    };
    const forte = (n, i) => {
      const p = pal(n), bate = w => i.txt.includes(w) || (w.length >= 6 && i.compact.includes(w)), hit = p.filter(bate).length;
      const d = String(n.doc || '').replace(/^0+/, '');
      if (d.length >= 4 && i.nums.has(d) && hit >= 1) return true;
      return hit >= 2 || (p.length === 1 && hit === 1 && p[0].length >= 5);
    };
    const txt = (n) => `Título ${n.doc || 's/ nº'} de ${n.parte}${n.np > 1 ? `, parcela ${n.parc}/${n.np}` : ''}, vencimento ${n.venc} (contas a ${n.tipo === 'P' ? 'pagar' : 'receber'} do cliente)`;
    const marca = (t, n, conf) => {
      usados.add(n.i);
      t.nf = { chaves: [], num: n.doc || '', cnpj: 'T' + norm(n.parte).replace(/[^A-Z0-9]/g, '').slice(0, 40), forn: n.parte, data: n.emissao || '', conf, obs: txt(n) + '.', parcela: n.np > 1 ? `${n.parc}/${n.np}` : '', tit: true, tipoTit: n.tipo };
      t.nfSug = null; casados++;
    };
    for (const t of tx.slice().sort((a, b) => dnum(a.data) - dnum(b.data))) {
      if (t.nf && t.nf.conf === 'A' && !t.nf.soForn) continue;
      const tp = t.tipo === 'D' ? 'P' : 'R';
      const cand = titulos.filter(n => !usados.has(n.i) && n.tipo === tp && (Math.abs(n.valor - t.valor) < 0.005 || (n.pago > 0 && Math.abs(n.pago - t.valor) < 0.005)))
        .map(n => ({ n, dd: dnum(t.data) - dnum(n.venc) })).filter(x => x.dd >= -15 && x.dd <= 45);
      if (!cand.length) continue;
      const i = info(t);
      const fortes = cand.filter(x => forte(x.n, i)).sort((a, b) => Math.abs(a.dd) - Math.abs(b.dd));
      if (fortes.length) { marca(t, fortes[0].n, 'A'); continue; }
      if (t.nf) continue;
      const perto = cand.filter(x => Math.abs(x.dd) <= 4).sort((a, b) => Math.abs(a.dd) - Math.abs(b.dd));
      if (!perto.length) continue;
      const n = perto[0].n, cent = Math.round(Math.abs(t.valor) * 100) % 100;
      if (perto.length === 1 && t.valor >= 10 && cent % 10 !== 0) { marca(t, n, 'M'); t.nf.obs = 'Valor quebrado e vencimento iguais ao ' + txt(n).replace(/^T/, 't') + '; confira.'; }
      else if (!t.nfSug) { t.nfSug = { chaves: [], num: n.doc || '', cnpj: 'T' + norm(n.parte).replace(/[^A-Z0-9]/g, '').slice(0, 40), forn: n.parte, data: n.emissao || '', obs: 'Sugestão (não aplicada): valor e vencimento iguais ao ' + txt(n) + '; a descrição não tem relação com o nome, confirme.' }; sugeridos++; }
    }
    return { casados, sugeridos, pendentes: titulos.filter(n => !usados.has(n.i)) };
  }
  const fmt = v => (+v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- dicionário aprendido ---------- */
  const idDoc = s => (String(s).match(/\d{2}\.\d{3}\.\d{3}[\/ ]\d{4}-\d{2}/) || [''])[0].replace(/\D/g, '');
  function chavesCliente(r) {
    const cat = norm(r.categoria), d = norm(r.descricao || r.complemento).replace(/\d[\d\/.\-]*/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    return [cat && d ? `cat|${cat}|${d}` : null, cat ? `cat|${cat}` : null].filter(Boolean);
  }
  function chavesExtrato(t) {
    const h = norm(t.historico).replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
    const c = norm(t.complemento);
    const doc = idDoc(t.complemento);
    const pal = c.replace(/DOC\.?:?\s*\S+/g, '').replace(/PAGAMENTO PIX|RECEBIMENTO PIX|TRANSFERENCIA PIX/g, '').replace(/[\d*\/.\-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 2).slice(0, 3).join(' ');
    return [doc ? `ext|${h}|${doc}` : null, pal ? `ext|${h}|${pal}` : null].filter(Boolean);
  }
  const chaveSegura = k => k.replace(/[^A-Z0-9| ]/g, '').slice(0, 120);

  return { norm, r2, fmt, parseValor, parseData, dnum, mesDe, pdfItemsToLines, pdfItemsToCells, pdfLinhasXY, extratoJson, parsePlano, isAnalitica, contaBancoNoPlano,
           extrairPlanilha, conferirSaldo, casar, casarNotas, casarTitulos, chavesCliente, chavesExtrato, chaveSegura, idDoc, nomeCompat, contaPorDocumento };
})();
const Local = (() => {
  const AMT = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
  const toF = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  const sinal = dc => (dc === 'D' || dc === '-') ? -1 : 1;
  const nrm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const pad = n => String(n).padStart(2, '0');
  const BANCOS = [[/cresol/i, 'CRESOL'], [/sicoob|sisbr/i, 'SICOOB'], [/caixa econ|sac caixa|caixa\.gov/i, 'CAIXA'], [/b ?a ?n ?r ?i ?s ?u ?l/i, 'BANRISUL'], [/santander/i, 'SANTANDER'], [/bradesco/i, 'BRADESCO'], [/ita[uú]/i, 'ITAÚ'],
    [/sicredi/i, 'SICREDI'], [/banco do brasil|bb\.com\.br/i, 'BANCO DO BRASIL'], [/mercado ?pago|mercadopago/i, 'MERCADO PAGO'], [/inter\b|banco inter/i, 'INTER'], [/nubank/i, 'NUBANK'],
    [/pague ?veloz/i, 'PAGUE VELOZ'], [/listo/i, 'LISTO'], [/cora\b/i, 'CORA'], [/c6 ?bank/i, 'C6 BANK']];
  const acharBanco = txt => { for (const [re, n] of BANCOS) if (re.test(txt)) return n; return null; };

  /* ---------- Sicoob ---------- */
  function sicoobA(lines, year) {
    let end = lines.findIndex(l => l.trim().startsWith('RESUMO')); if (end < 0) end = lines.length;
    let start = lines.findIndex(l => /^\s*DATA\b/.test(l) && /HIST/.test(l)); start = start < 0 ? 0 : start + 1;
    const txs = []; let cur = null, pend = null;
    const dateRe = new RegExp('^(\\d{2}/\\d{2})\\s+(.*?)\\s*(?:(' + AMT + ')\\s*([CD*])?)?\\s*$');
    for (const raw of lines.slice(start, end)) {
      const s = raw.trim(); if (!s) continue;
      if (/^https?:\/\//.test(s) || /^\d+\/\d+$/.test(s)) continue;
      const ma = s.match(new RegExp('^(' + AMT + ')\\s*([CD*])?$'));
      if (ma && !/^\d{2}\/\d{2}\s/.test(s)) { pend = [ma[1], ma[2]]; continue; }
      if (s === 'C' || s === 'D' || s === '*') { if (cur && cur.dc == null) cur.dc = s; continue; }
      const m = s.match(dateRe);
      if (m && /^\d{2}\/\d{2}\s/.test(s)) {
        if (cur) txs.push(cur);
        let [, d, hist, a, dc] = m;
        if (a == null && pend) { a = pend[0]; dc = pend[1]; }
        pend = null;
        cur = { dm: d, hist: hist.trim(), valor: a ? toF(a) : null, dc: dc || null, comp: [] };
        continue;
      }
      if (cur) cur.comp.push(s);
    }
    if (cur) txs.push(cur);
    return txs;
  }
  function sicoobB(lines) {
    let end = lines.findIndex(l => l.trim() === 'RESUMO'); if (end < 0) end = lines.length;
    const txs = []; let cur = null;
    const dateRe = new RegExp('^\\s*(\\d{2}/\\d{2})\\s+(.*?)\\s+R\\$\\s*(' + AMT + ')\\s*([CD*])\\s*$');
    for (const raw of lines.slice(0, end)) {
      const s = raw.trim();
      if (!s || /^https?:\/\//.test(s) || /Internet Banking/.test(s) || /^Data\s+Documento/.test(s) || /HISTÓRICO DE MOVIMENTA/.test(s) ||
        /^(SISTEMA DE|PLATAFORMA|EXTRATO DE|Cooperativa:|Conta:|Periodo:|Período:)/.test(s)) continue;
      const m = raw.match(dateRe);
      if (m) {
        if (cur) txs.push(cur);
        const [, d, mid, a, dc] = m;
        const parts = mid.trim().split(/\s{2,}/);
        const doc = parts.length >= 2 ? parts[0] : '', hist = parts.length >= 2 ? parts.slice(1).join(' ') : parts[0];
        cur = { dm: d, hist: hist.trim(), valor: toF(a), dc, comp: doc ? ['DOC.: ' + doc] : [] };
        continue;
      }
      if (cur) cur.comp.push(s);
    }
    if (cur) txs.push(cur);
    return txs;
  }

  /** Confere cada saldo diário impresso pelo banco com o que foi lido até o fim daquele dia. Devolve quantos não batem. */
  function divDiario(lancs, saldosDia, sa) {
    if (sa == null || !saldosDia.length) return 0;
    const dn = d => { const [a, b, c] = d.split('/'); return +c * 10000 + +b * 100 + +a; };
    let ruins = 0;
    for (const sd of saldosDia) {
      const lim = dn(sd.data);
      const soma = lancs.filter(t => dn(t.data) <= lim).reduce((a, t) => a + (t.tipo === 'C' ? 1 : -1) * Math.round(t.valor * 100), 0);
      if (Math.abs(Math.round(sa * 100) + soma - Math.round(sd.v * 100)) > 1) ruins++;
    }
    return ruins;
  }
  function sicoob(lines) {
    const txt = lines.join('\n');
    const mp = txt.match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i);
    const mc = txt.match(/Conta:\s*([\d.\-]+)\s*\/\s*([^\n]+)/i);
    const mk = txt.match(/(?:COOP\.|Cooperativa):\s*([\d\-]+)/i);
    if (!mp || !/sicoob|sisbr/i.test(txt)) return null;
    const fimY = +mp[2].slice(6), fimM = +mp[2].slice(3, 5);
    const ano = m => (+m > fimM && +mp[1].slice(3, 5) < +m) ? fimY - 1 : fimY;
    const bCount = lines.filter(l => /\s+R\$\s*\d.*[CD*]\s*$/.test(l) && /^\s*\d{2}\/\d{2}\s/.test(l)).length;
    const raw = bCount > 3 ? sicoobB(lines) : sicoobA(lines, fimY);
    const lancs = []; let saldoAnt = null; const saldosDia = [];
    for (const t of raw) {
      const h = t.hist;
      if (/^SALDO ANTERIOR/.test(h)) { if (t.valor != null && saldoAnt == null) saldoAnt = t.valor * sinal(t.dc); continue; }
      if (/^SALDO BLOQ/.test(h)) continue;
      if (/^SALDO DO DIA/.test(h)) { if (t.valor != null) saldosDia.push({ dm: t.dm, v: t.valor * sinal(t.dc) }); continue; }
      if (t.valor == null || (t.dc !== 'C' && t.dc !== 'D')) continue;
      const [dd, mm] = t.dm.split('/');
      lancs.push({ data: `${dd}/${mm}/${ano(mm)}`, historico: h, complemento: t.comp.join(' / '), valor: Math.round(t.valor * 100) / 100, tipo: t.dc });
    }
    let saldoFinal = null;
    if (saldosDia.length) {
      const chave = s => { const [d, m] = s.dm.split('/'); return (ano(m) * 100 + +m) * 100 + +d; };
      saldoFinal = saldosDia.reduce((a, b) => chave(b) > chave(a) ? b : (chave(b) === chave(a) ? a : a)).v;
    }
    const [coop] = [mk && mk[1]];
    const sdDatas = saldosDia.map(x => { const [d, m] = x.dm.split('/'); return { data: `${d}/${m}/${ano(m)}`, v: x.v }; });
    return { banco: 'SICOOB', agencia: coop ? coop.replace(/-\d$/, '') : '', conta: mc ? mc[1] : '', titular: mc ? mc[2].trim() : '', cnpj: '',
      periodoInicio: mp[1], periodoFim: mp[2], saldoAnterior: saldoAnt, saldoFinal, divergencias: divDiario(lancs, sdDatas, saldoAnt), lancamentos: lancs };
  }

  /* ---------- Caixa (extrato por período) ---------- */
  function caixa(lines) {
    const txt = lines.join('\n');
    if (!/CAIXA/i.test(txt) || !/Nr\. Doc\./.test(txt)) return null;
    const mc = txt.match(/Conta:\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d\-]+)/);
    const mt = txt.match(/Cliente:\s*([^\n]+)/);
    const lancs = []; let sa = null, last = null;
    const re = new RegExp('^\\s*(\\d{2}/\\d{2}/\\d{4})\\s+(\\d+)\\s+(.+?)\\s{2,}(' + AMT + ')\\s*([CD])\\s+(' + AMT + ')\\s*([CD])\\s*$');
    for (const l of lines) {
      const ma = l.match(new RegExp('SALDO ANTERIOR\\s+(' + AMT + ')\\s*([CD])'));
      if (ma && sa == null) sa = toF(ma[1]) * sinal(ma[2]);
      const m = l.match(re); if (!m) continue;
      const [, d, doc, h, v, dc, s, sdc] = m;
      last = toF(s) * sinal(sdc);
      if (/^SALDO DIA/.test(h.trim())) continue;
      lancs.push({ data: d, historico: h.trim(), complemento: /^0+$/.test(doc) ? '' : 'DOC.: ' + doc, valor: toF(v), tipo: dc });
    }
    if (!lancs.length) return null;
    const ds = lancs.map(t => t.data);
    const [, mm, yy] = ds[0].split('/'); const ult = new Date(+yy, +mm, 0).getDate();
    return { banco: 'CAIXA', agencia: mc ? mc[2] : '', conta: mc ? mc[3] : '', titular: mt ? mt[1].trim() : '', cnpj: '',
      periodoInicio: `01/${mm}/${yy}`, periodoFim: `${pad(ult)}/${mm}/${yy}`, saldoAnterior: sa, saldoFinal: last, lancamentos: lancs };
  }

  /* ---------- Banrisul (extrato "para simples conferência") ---------- */
  function banrisul(lines) {
    lines = lines.map(l => String(l).replace(/(\d),\s+(\d{2})(?!\d)/g, '$1,$2')); // OCR às vezes separa o valor ("30.834, 84-")
    const txt = lines.join('\n');
    if (!/B ?A ?N ?R ?I ?S ?U ?L/i.test(txt) || !/SALDO ANT EM/i.test(txt)) return null;
    const MESES = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
    const sA = txt.match(new RegExp('SALDO ANT EM\\s+(\\d{2})/(\\d{2})/(\\d{4})\\s+(' + AMT + ')(-?)'));
    const mm = txt.match(/MOVIMENTOS\s+([A-Z]{3})\/(\d{4})/);
    if (!sA || !mm || !MESES[mm[1]]) return null;
    const mes = MESES[mm[1]], ano = +mm[2], sa = toF(sA[4]) * (sA[5] ? -1 : 1);
    const reL = new RegExp('^\\s*(?:(\\d{2})\\s+)?([A-Z][A-Z0-9 /.]*?)\\s+(\\S{3,9}(?:\\s[A-Z0-9]{1,3})?)\\s+(' + AMT + ')(-?)\\s*$'); // código do documento (aceita erros de OCR: "LI6éPIN", "34D3 86")
    const reS = new RegExp('^\\s*(?:\\d{2}\\s+)?SALDO NA DATA\\s+(' + AMT + ')(-?)\\s*$');
    const lancs = []; let dia = null, last = null, saldoFinal = null;
    for (const l of lines) {
      const ms = l.match(reS);
      if (ms) { saldoFinal = toF(ms[1]) * (ms[2] ? -1 : 1); continue; }
      const mn = l.match(/^\s*NOME:\s*(.+?)\s*$/);
      if (mn) { if (last) last.nomes.push(mn[1]); continue; }
      const m = l.match(reL); if (!m) continue;
      if (m[1]) dia = +m[1];
      if (dia == null || /^(LIMITE|SALDO|VENCIMENTO)/.test(m[2])) continue;
      last = { data: `${pad(dia)}/${pad(mes)}/${ano}`, historico: m[2].trim(), doc: m[3], valor: toF(m[4]), tipo: m[5] ? 'D' : 'C', nomes: [] };
      lancs.push(last);
    }
    if (!lancs.length) return null;
    lancs.forEach(t => { t.complemento = [...t.nomes, /^0+$/.test(t.doc) ? '' : 'DOC.: ' + t.doc].filter(Boolean).join(' / '); delete t.nomes; delete t.doc; });
    const ag = txt.match(/AGENCIA:\s*(\d+)/), ct = txt.match(/CONTA\.*:\s*([\d.\-]+)/), nm = txt.match(/NOME\.+:\s*([^\n]+)/);
    const ult = new Date(ano, mes, 0).getDate();
    return { banco: 'BANRISUL', agencia: ag ? ag[1] : '', conta: ct ? ct[1] : '', titular: nm ? nm[1].trim() : '', cnpj: '',
      periodoInicio: `01/${pad(mes)}/${ano}`, periodoFim: `${pad(ult)}/${pad(mes)}/${ano}`, saldoAnterior: sa, saldoFinal, lancamentos: lancs };
  }

  /* ---------- Itaú Empresas ("Lançamentos do período": Data, Lançamentos, Razão Social, CNPJ/CPF, Valor, Saldo) ---------- */
  function itau(lines) {
    const txt = lines.join('\n');
    if (!/Lan[cç]amentos do per[ií]odo/i.test(txt) || !/Raz[aã]o Social/i.test(txt) || !/SALDO TOTAL DISPON/i.test(txt)) return null;
    const reD = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(.*)$/;
    const reV = new RegExp('(-?' + AMT + ')\\s*$');
    const reDoc = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\*{3}\.\d{3}\.\d{3}-\*{2}/;
    const cols = x => x.trim().split(/\s{2,}/).filter(Boolean);
    const blocos = []; let cur = null, sobra = [];
    const body = lines.slice(Math.max(0, lines.findIndex(l => /Lan[cç]amentos\s+Raz[aã]o Social/i.test(l)) + 1));
    const off = lines.length - body.length, geo = !!(lines.ys && lines.xs && lines.ys.length === lines.length);
    const soltas = [];
    for (let i = 0; i < body.length; i++) {
      const l = body[i];
      if (/^\s*(aviso:|atualizado em|Em caso de d)/i.test(l)) break;
      if (/^\s*Data\s+Lan[cç]amentos\s+Raz[aã]o Social/i.test(l)) continue;
      const m = l.match(reD);
      if (m) { cur = { data: m[1], rest: m[2], idx: l.length - m[2].length, antes: [], depois: [], y: geo ? lines.ys[off + i] : null, ant: [], dep: [] }; blocos.push(cur); }
      else if (l.trim()) { soltas.push({ l, y: geo ? lines.ys[off + i] : null, x: geo ? lines.xs[off + i] : null, prev: cur, k: blocos.length }); if (cur) cur.depois.push(l); else sobra.push(l); }
    }
    // com a geometria do PDF: cada linha solta pertence ao lançamento mais próximo (acima ou abaixo)
    if (geo) {
      for (const b of blocos) b.depois = [];
      for (const s of soltas) {
        const P = s.prev, N = blocos[s.k];
        const dP = P ? P.y - s.y : Infinity, dN = N ? s.y - N.y : Infinity;
        if (dN < dP) N.ant.push(s); else if (P) P.dep.push(s);
      }
    }
    // linhas sem data entre dois blocos: a primeira pode ser o início do bloco seguinte
    const lancs = []; let sa = null, sf = null, sfData = null; const saldosD = [], totDia = {};
    for (let k = 0; k < blocos.length; k++) {
      const b = blocos[k];
      const mv = b.rest.match(reV);
      if (/^SALDO ANTERIOR/.test(b.rest)) { if (mv) sa = toF(mv[1]); continue; }
      if (/^SALDO TOTAL\s+-?\d/.test(b.rest) && mv) { totDia[b.data] = toF(mv[1]); continue; }
      if (/^SALDO TOTAL DISPON/.test(b.rest)) { if (mv) saldosD.push({ data: b.data, v: toF(mv[1]) }); if (mv && (!sfData || C_dn(b.data) > sfData)) { sf = toF(mv[1]); sfData = C_dn(b.data); } continue; }
      if (!mv || /^SALDO\b/.test(b.rest)) continue;
      b.valor = mv[1];
      let r = b.rest.slice(0, b.rest.lastIndexOf(mv[1])).trim();
      const md = r.match(reDoc); const cnpj = md ? md[0] : '';
      if (md) r = r.replace(md[0], '  ').trim();
      const p = cols(r);
      b.hist = p[0] || ''; b.razao = p[1] || ''; b.cnpj = cnpj;
      // uma célula só, mas na coluna da razão social (mais à direita) -> não é o histórico
      if (geo && p.length === 1 && b.idx >= 36) { b.razao = p[0]; b.hist = ''; }
      b.precisaAntes = !b.hist || (cnpj && !b.razao);
    }
    // distribui as linhas soltas: cada bloco "incompleto" toma a última linha solta antes dele
    if (!geo) for (let k = 0; k < blocos.length; k++) {
      const b = blocos[k], prev = blocos[k - 1];
      if (b.precisaAntes && prev && prev.depois.length) b.antes = [prev.depois.pop()];
    }
    for (const b of blocos) {
      if (b.valor == null) continue;
      let hist = b.hist, razao = b.razao, doc = '';
      if (geo) {
        const H = [], R = [], D = [];
        const poe = s => { const q = cols(s.l); if (q.length >= 2) { H.push(q[0]); R.push(q.slice(1).join(' ')); } else if (s.x < 200) H.push(q[0]); else if (s.x < 355) R.push(q[0]); else D.push(q[0]); };
        b.ant.forEach(poe);
        const Hm = [...H], Rm = [...R], Dm = [...D]; H.length = R.length = D.length = 0;
        b.dep.forEach(poe);
        hist = [...Hm, hist, ...H].filter(Boolean).join(' '); razao = [...Rm, razao, ...R].filter(Boolean).join(' '); doc = [...Dm, ...D].join(' ');
        const v = toF(b.valor);
        lancs.push({ data: b.data, historico: hist.trim(), complemento: [razao.trim(), b.cnpj, doc ? 'DOC.: ' + doc : ''].filter(Boolean).join(' / '), valor: Math.abs(v), tipo: v < 0 ? 'D' : 'C' });
        continue;
      }
      for (const l of b.antes) { const q = cols(l); if (!hist) { hist = q[0]; if (q[1]) razao = q[1] + (razao ? ' ' + razao : ''); } else razao = q[0] + (razao ? ' ' + razao : ''); }
      for (const l of b.depois) {
        const q = cols(l);
        if (q.length >= 2) { doc = doc || q[0]; razao = (razao + ' ' + q.slice(1).join(' ')).trim(); }
        else if (b.cnpj) razao = (razao + ' ' + q[0]).trim();
        else hist = (hist + ' ' + q[0]).trim();
      }
      const v = toF(b.valor);
      lancs.push({ data: b.data, historico: hist.trim(), complemento: [razao.trim(), b.cnpj, doc ? 'DOC.: ' + doc : ''].filter(Boolean).join(' / '), valor: Math.abs(v), tipo: v < 0 ? 'D' : 'C' });
    }
    if (!lancs.length) return null;
    lancs.reverse(); // o extrato vem do mais novo para o mais antigo
    const mt = txt.match(/^\s*(.+?)\s+CNPJ\s+([\d.\/\-]+)\s+Ag[eê]ncia\s+(\d+)\s+Conta\s+([\d\-]+)/m);
    const mp = txt.match(/per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+(\d{2}\/\d{2}\/\d{4})/i);
    return { banco: 'ITAÚ', agencia: mt ? mt[3] : '', conta: mt ? mt[4] : '', titular: mt ? mt[1].trim() : '', cnpj: mt ? mt[2].replace(/\D/g, '') : '',
      periodoInicio: mp ? mp[1] : lancs[0].data, periodoFim: mp ? mp[2] : lancs[lancs.length - 1].data, saldoAnterior: sa, saldoFinal: sf, divergencias: divItau(lancs, saldosD.map(d => ({ data: d.data, v: totDia[d.data] != null ? totDia[d.data] : d.v })), sa), lancamentos: lancs };
  }
  /** Só conta divergência que persiste nos dias seguintes (o banco às vezes mostra um saldo do dia com valor bloqueado/diferido) */
  function divItau(lancs, saldosD, sa) {
    if (sa == null || !saldosD.length) return 0;
    const dn = d => { const [a, b, c] = d.split('/'); return +c * 10000 + +b * 100 + +a; };
    const ord = saldosD.slice().sort((a, b) => dn(a.data) - dn(b.data));
    const ruim = ord.map(sd => { const lim = dn(sd.data); const soma = lancs.filter(t => dn(t.data) <= lim).reduce((a, t) => a + (t.tipo === 'C' ? 1 : -1) * Math.round(t.valor * 100), 0); return Math.abs(Math.round(sa * 100) + soma - Math.round(sd.v * 100)) > 1; });
    return ruim.filter((r, i) => r && (i === ruim.length - 1 || ruim[i + 1])).length;
  }
  const C_dn = d => { const [a, b, c] = d.split('/'); return +c * 10000 + +b * 100 + +a; };

  /* ---------- Nubank PJ ("Movimentações": dia com Total de entradas/saídas, lançamentos e Saldo do dia) ---------- */
  function nubank(lines) {
    const txt = lines.join('\n');
    if (!/Saldo do dia/.test(txt) || !/Total de (entradas|sa[ií]das)/.test(txt) || !/Movimenta[cç][oõ]es/.test(txt) || !/Nu (Pagamentos|Financeira)|nubank/i.test(txt)) return null;
    const MES = { JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06', JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12' };
    const reAmt = new RegExp('(' + AMT + ')\\s*$');
    const reDia = /^(\d{2})\s+([A-ZÇ]{3})\s+(\d{4})\s+Total de (entradas|sa[ií]das)\s+[+-]?\s*(\d[\d.,]*)/;
    let sa = null, sf = null;
    const msa = txt.match(/Saldo inicial\s+(-?\d[\d.,]*)/); if (msa) sa = toF(msa[1]);
    const msf = txt.match(/Saldo final do per[ií]odo\s+(-?\d[\d.,]*)\s*$/m); if (msf) sf = toF(msf[1]);
    const raw = []; let data = null, modo = null, cur = null, pulando = true, iniciou = false;
    const saldosD = [];
    for (const l of lines) {
      const t = l.trim(); if (!t) continue;
      if (/^Movimenta[cç][oõ]es\s*$/.test(t)) { pulando = false; iniciou = true; continue; }
      if (!iniciou) continue;
      if (/^Tem alguma d[uú]vida\?/.test(t)) { pulando = true; cur = cur; continue; }
      if (pulando) { if (/VALORES EM R\$/.test(t)) pulando = false; continue; }
      if (/^(Caso a solu|dispon[ií]veis nos meios|metropolitanas|N[aã]o nos responsabilizamos|Asseguramos|Nu Financeira|Nu Pagamentos|e Investimento|CNPJ: \d|Extrato gerado)/.test(t)) { pulando = true; continue; }
      const md = t.match(reDia);
      if (md) { data = `${md[1]}/${MES[md[2]] || '01'}/${md[3]}`; modo = /^entradas/.test(md[4]) ? 'C' : 'D'; cur = null; continue; }
      const mt = t.match(/^Total de (entradas|sa[ií]das)\s/);
      if (mt) { modo = mt[1] === 'entradas' ? 'C' : 'D'; cur = null; continue; }
      const ms = t.match(/^Saldo do dia\s+(-?\d[\d.,]*)/);
      if (ms) { if (data) saldosD.push({ data, v: toF(ms[1]) }); cur = null; continue; }
      const me = l.match(/^(\S.*?)\s{2,}(.*?)\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
      if (me && data && modo && /^[A-ZÀ-Ú]/.test(t) && !/^(Saldo|Rendimento|Conta:|Ag[eê]ncia)/.test(t)) { cur = { data, tipo: modo, h: me[1].trim(), d: me[2].trim(), valor: toF(me[3]) }; raw.push(cur); continue; }
      if (cur) cur.d += ' ' + t;
    }
    const lancs = raw.map(r => {
      let d = r.d.replace(/•/g, '*');
      d = d.replace(/\s*-?\s*(?:Ag[eê]ncia|Conta):.*$/i, '').trim();
      const md = d.match(/\*{3}\.\d{3}\.\d{3}-\*{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/);
      let nome = d, doc = '';
      if (md) { nome = d.slice(0, d.indexOf(md[0])).replace(/\s*-\s*$/, '').trim(); doc = md[0]; }
      else nome = nome.replace(/\s*-\s*[^-]*\(\d{4}\)\s*$/, '').trim();
      nome = nome.replace(/^\d{2}\.\d{3}\.\d{3}\s+/, '').trim();
      return { data: r.data, historico: r.h, complemento: [nome, doc].filter(Boolean).join(' / '), valor: r.valor, tipo: r.tipo };
    });
    if (!lancs.length) return null;
    const mc = txt.match(/CNPJ\s+([\d.\/\-]+)\s+Ag[eê]ncia\s+(\d+)\s+Conta\s*\n?\s*([\d\-]+)/);
    const mp = txt.match(/(\d{2}) DE ([A-ZÇ]+) DE (\d{4}) a (\d{2}) DE ([A-ZÇ]+) DE (\d{4})/);
    const NM = { JANEIRO: '01', FEVEREIRO: '02', 'MARÇO': '03', ABRIL: '04', MAIO: '05', JUNHO: '06', JULHO: '07', AGOSTO: '08', SETEMBRO: '09', OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12' };
    return { banco: 'NUBANK', agencia: mc ? mc[2] : '0001', conta: mc ? mc[3] : '', titular: (lines[0] || '').trim(), cnpj: mc ? mc[1].replace(/\D/g, '') : '',
      periodoInicio: mp ? `${mp[1]}/${NM[mp[2]] || '01'}/${mp[3]}` : lancs[0].data, periodoFim: mp ? `${mp[4]}/${NM[mp[5]] || '01'}/${mp[6]}` : lancs[lancs.length - 1].data,
      saldoAnterior: sa, saldoFinal: sf, divergencias: divDiario(lancs, saldosD, sa), lancamentos: lancs };
  }

  /* ---------- PagBank/PagSeguro "Relatório de Vendas" da maquininha: vira venda (bruto) + taxa, por transação ---------- */
  function pagbankVendas(lines) {
    const txt = lines.join('\n');
    if (!/Relat[oó]rio de Vendas/i.test(txt) || !/C[oó]digo NSU/i.test(txt) || !/Valor bruto/i.test(txt) || !/Valor l[ií]quido/i.test(txt)) return null;
    const AM = '(?:R\\$\\s*)?(-?' + AMT + ')';
    const re = new RegExp('^\\s*(\\d{2}/\\d{2}/\\d{4})\\s+\\d{2}:\\d{2}\\s+(.*?)\\s+(\\d{6,14})\\s{2,}(.+?)\\s{2,}(\\S+(?: \\S+)?)\\s+' + AM + '\\s+' + AM + '\\s+' + AM + '\\s*$');
    const rows = [], liqDia = {}; let dia = null, naoAprov = 0;
    const mp = txt.match(/Per[ií]odo\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/);
    for (const l of lines) {
      const m = l.match(re);
      if (m) {
        if (!/^Aprovada$/i.test(m[5].trim())) { naoAprov++; continue; }
        dia = m[1]; rows.push({ data: m[1], tipo: m[4].trim(), nsu: m[3], bruto: toF(m[6]), taxa: toF(m[7]), liq: toF(m[8]) });
        continue;
      }
      const ml = l.match(new RegExp('^\\s*Valor L[ií]quido do dia:\\s*' + AM + '\\s*$', 'i'));
      if (ml && dia) { liqDia[dia] = toF(ml[1]); }
    }
    if (rows.length < 2) return null;
    // confere o líquido de cada dia com o total que o próprio relatório informa
    const soma = {}; for (const r of rows) soma[r.data] = Math.round(((soma[r.data] || 0) + r.liq) * 100) / 100;
    let diverg = 0; for (const d of Object.keys(liqDia)) if (Math.abs((soma[d] || 0) - liqDia[d]) > 0.015) diverg++;
    const lancs = [];
    for (const r of rows.slice().reverse()) { // o relatório vem do dia mais novo para o mais antigo
      const nome = r.tipo.toUpperCase();
      lancs.push({ data: r.data, historico: 'VENDA ' + nome, complemento: 'NSU ' + r.nsu, valor: r.bruto, tipo: 'C' });
      if (r.taxa > 0) lancs.push({ data: r.data, historico: 'TAXA ' + nome, complemento: 'NSU ' + r.nsu, valor: r.taxa, tipo: 'D' });
    }
    const total = Math.round(rows.reduce((a, r) => a + r.liq, 0) * 100) / 100;
    const nm = (lines.find(l => /CNPJ:/.test(l)) || '').trim();
    const mj = txt.match(/CNPJ:\s*([\d.\/\-]+)/);
    const ds = lancs.map(l => l.data).sort((a, b) => C_dn(a) - C_dn(b));
    return { banco: 'PAGBANK (MAQUININHA)', agencia: '', conta: '', titular: (lines[0] || '').trim(), cnpj: mj ? mj[1].replace(/\D/g, '') : '',
      periodoInicio: mp ? mp[1] : ds[0], periodoFim: mp ? mp[2] : ds[ds.length - 1], saldoAnterior: 0, saldoFinal: total, divergencias: diverg, lancamentos: lancs,
      aviso: naoAprov ? `${naoAprov} transação(ões) não aprovada(s) no relatório foram ignoradas.` : '' };
  }

  /* ---------- Sicredi ("Extrato (Período de ...)": Data, Descrição, Documento, Valor, Saldo) ---------- */
  function sicredi(lines) {
    const txt = lines.join('\n');
    if (!/Associado:/i.test(txt) || !/Extrato\s*\(Per[ií]odo de/i.test(txt) || !/Cooperativa:/i.test(txt)) return null;
    const re = new RegExp('^\\s*(\\d{2}/\\d{2}/\\d{4})\\s+(.*?)\\s+(-?' + AMT + ')\\s+(-?' + AMT + ')\\s*$');
    const fmtDoc = d => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    const lancs = []; let sa = null, sf = null;
    for (const l of lines) {
      const ma = l.match(new RegExp('SALDO ANTERIOR\\s+(-?' + AMT + ')'));
      if (ma && sa == null) { sa = toF(ma[1]); continue; }
      const m = l.match(re); if (!m) continue;
      const partes = m[2].split(/\s{2,}/).map(x => x.trim()).filter(Boolean);
      let desc = partes[0], doc = partes.length > 1 ? partes[partes.length - 1] : '';
      if (/^SALDO/.test(desc)) continue;
      const v = toF(m[3]); sf = toF(m[4]);
      let hist = desc, comp = '';
      const md = desc.match(/^(.*?)\s+(\d{14}|\d{11})\s+(.*)$/);
      if (md) { hist = md[1]; comp = [md[3], fmtDoc(md[2])].filter(Boolean).join(' / '); }
      if (doc && !/^PIX_(DEB|CRED)$/.test(doc) && doc !== hist) comp = [comp, 'DOC.: ' + doc].filter(Boolean).join(' / ');
      lancs.push({ data: m[1], historico: hist.trim(), complemento: comp, valor: Math.abs(v), tipo: v < 0 ? 'D' : 'C' });
    }
    if (!lancs.length) return null;
    const mp = txt.match(/Per[ií]odo de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
    const ma2 = txt.match(/Associado:\s*([^\n]+)/), mc = txt.match(/Cooperativa:\s*(\d+)/), mt = txt.match(/Conta:\s*([\d\-]+)/);
    return { banco: 'SICREDI', agencia: mc ? mc[1] : '', conta: mt ? mt[1] : '', titular: ma2 ? ma2[1].trim() : '', cnpj: '',
      periodoInicio: mp ? mp[1] : lancs[0].data, periodoFim: mp ? mp[2] : lancs[lancs.length - 1].data, saldoAnterior: sa, saldoFinal: sf, lancamentos: lancs };
  }

  /* ---------- Banco do Brasil ("Extrato de Conta Corrente": Dia, Lote, Documento, Histórico, Valor (+)/(-)) ---------- */
  function bb(lines) {
    const txt = lines.join('\n');
    if (!/Extrato de Conta Corrente/i.test(txt) || !/Lote\s+Documento/i.test(txt) || !/\d,\d{2}\s*\((\+|-)\)/.test(txt)) return null;
    const reV = new RegExp('(' + AMT + ')\\s*\\((\\+|-)\\)\\s*$');
    const reD = /^\s*(\d{2}\/\d{2}\/\d{3,4})\s*(.*)$/;
    const fmtDoc = d => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
    const rows = [];
    for (const raw of lines) {
      const l = raw.replace(/\s+$/, '');
      if (!l.trim()) continue;
      if (/^\s*(Informa[cç][oõ]es Adicionais|Total Aplica)/i.test(l)) break;
      if (/^\s*(Extrato de Conta|Cliente\s|Ag[eê]ncia:|Lan[cç]amentos\s*$|Dia\s+Lote)/i.test(l)) continue;
      const row = { raw: l, data: null, rest: l.trim(), val: null, sinal: null };
      const mv = l.match(reV);
      if (mv) { row.val = toF(mv[1]); row.sinal = mv[2]; row.rest = l.slice(0, l.lastIndexOf(mv[1])).trim(); }
      const md = row.rest.match(reD);
      if (md) { row.data = md[1]; row.rest = md[2].trim(); }
      rows.push(row);
    }
    const anos = {}; for (const r of rows) { const m = r.data && r.data.match(/\/(\d{4})$/); if (m && m[1] !== '0000') anos[m[1]] = (anos[m[1]] || 0) + 1; }
    const ano = Object.keys(anos).sort((a, b) => anos[b] - anos[a])[0] || null;
    const lancs = []; let sa = null, sf = null, cur = null, prev = null, prevPrecisaDetalhe = false, pend = [], saldoNext = false;
    const fim = () => { if (prev && prevPrecisaDetalhe && pend.length) { prev.detalhe = pend.shift(); prevPrecisaDetalhe = false; } };
    for (const r of rows) {
      if (r.data && !r.val) {
        if (/^00\/00\/0000$/.test(r.data)) { fim(); pend = []; cur = null; continue; }
        fim();
        let tipo = r.rest;
        if (!tipo && pend.length) tipo = pend.pop();
        pend = [];
        cur = { data: r.data, tipo };
        continue;
      }
      if (r.val != null) {
        const cp = r.rest.replace(/^\d{2}\/\d{2}\/\d{3,4}\s*/, '').replace(/\s+/g, '').toUpperCase();
        const sal = /^SALDO(ANTERIOR|DODIA)?$/.exec(cp);
        if (sal) {
          if (sal[1] === 'ANTERIOR') sa = r.val * (r.sinal === '-' ? -1 : 1);
          else if (!sal[1]) sf = r.val * (r.sinal === '-' ? -1 : 1);
          pend = []; cur = null; prev = null; continue;
        }
        let c = cur;
        if (r.data) { fim(); c = { data: r.data, tipo: r.rest.replace(/^\d{4,5}(?:\s+\d{3,}(?=\s))?\s+/, '') }; r.rest = ''; pend = []; }
        if (!c) continue;
        const m = r.rest.match(/^(\d{4,5})(?:\s+(\d{3,})(?=\s|$))?\s*(.*)$/) || [null, '', '', r.rest];
        const livre = r.data ? r.rest : m[3];
        let tipo = c.tipo;
        if (r.data && !m[1]) { /* anchor na linha da data: o texto é do tipo */ }
        const rec = { data: c.data, tipo, lote: m[1] || '', doc: m[2] || '', inline: (r.data ? (r.rest.replace(/^(\d{4,5})\s+(?:(\d{3,})\s+)?/, '')) : m[3]).trim(), detalhe: '', valor: r.val, sinal: r.sinal };
        if (r.data && !rec.tipo) { rec.tipo = rec.inline; rec.inline = ''; }
        if (r.data) { const mm = (r.raw.match(/(\d{4,5})\s+(?:(\d{3,})\s+)?(.+?)\s{2,}/) || []); }
        lancs.push(rec); prev = rec; prevPrecisaDetalhe = !rec.inline; pend = []; cur = null;
        continue;
      }
      pend.push(r.rest.replace(/^\d\s{2,}/, '').trim());
    }
    if (!lancs.length) return null;
    const fixAno = d => { const [a, b, c] = d.split('/'); return `${a}/${b}/${c.length === 4 ? c : (ano || c)}`; };
    const out = lancs.map(r => {
      const nome = (r.inline || r.detalhe || '').replace(/^\d{2}\/\d{2}\s+\d{2}:\d{2}\s+/, '').replace(/\b(\d{14})\b/, (x) => fmtDoc(x));
      const comp = [nome, r.doc ? 'DOC.: ' + r.doc : ''].filter(Boolean).join(' / ');
      return { data: fixAno(r.data), historico: r.tipo.trim(), complemento: comp, valor: r.valor, tipo: r.sinal === '-' ? 'D' : 'C' };
    });
    const ult = out[out.length - 1].data.split('/'); const mes = +ult[1], an = +ult[2];
    const mt = txt.match(/Cliente\s+([^\n]+)/), ag = txt.match(/Ag[eê]ncia:\s*([\d\-]+)/), ct = txt.match(/Conta:\s*([\d\-]+)/);
    return { banco: 'BANCO DO BRASIL', agencia: ag ? ag[1] : '', conta: ct ? ct[1] : '', titular: mt ? mt[1].trim() : '', cnpj: '',
      periodoInicio: `01/${pad(mes)}/${an}`, periodoFim: `${pad(new Date(an, mes, 0).getDate())}/${pad(mes)}/${an}`, saldoAnterior: sa, saldoFinal: sf, lancamentos: out };
  }

  const fmtN = v => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  /* ---------- Caixa Internet Banking novo ("Data / Documento / Histórico / Valor / Saldo" com Data Efetiva) ---------- */
  function caixaNovo(lines) {
    const txt = lines.join('\n');
    if (!/Data Efetiva/i.test(txt) || !/Saldo anterior ao per[ií]odo/i.test(txt)) return null;
    const reA = new RegExp('^\\s*(\\d{4,8})\\s*(.*?)\\s+(-\\s+)?R\\$\\s*(' + AMT + ')\\s+R\\$\\s*(' + AMT + ')\\s*([CD])\\s*$');
    const reS = new RegExp('SALDO DIA\\s+R\\$\\s*(' + AMT + ')\\s*([CD])');
    const reDate = /^\s*(\d{2}\/\d{2}\/\d{4})\s*(.*)$/, reEf = /^\s*(\d{2}\/\d{2}\s+\d{2}:\d{2})\s*(.*)$/;
    const sg = (v, dc) => toF(v) * (dc === 'D' ? -1 : 1);
    const lancs = []; let sa = null, sf = null, cur = null, prev = null, pend = [], run = null;
    const fecha = (comTipoInline) => { let tipo = null; if (!comTipoInline && pend.length) tipo = pend.pop(); if (prev) prev.cont.push(...pend); pend = []; return tipo; };
    for (const l of lines) {
      if (!l.trim()) continue;
      if (/^\s*SAC CAIXA/.test(l)) break;
      if (/^\s*(Data\s+Documento|Data Efetiva|CNPJ:|Ag[eê]ncia:|Extrato no per)/i.test(l)) continue;
      let m = l.match(new RegExp('Saldo anterior ao per[ií]odo.*R\\$\\s*(' + AMT + ')\\s*([CD])'));
      if (m) { sa = sg(m[1], m[2]); run = sa; continue; }
      m = l.match(reS);
      if (m) { fecha(true); sf = sg(m[1], m[2]); cur = null; prev = null; continue; }
      m = l.match(reA);
      let so = null;
      if (!m && cur) { const m2 = l.match(new RegExp('^\\s*(\\d{4,8})\\s*(.*?)\\s+R\\$\\s*(' + AMT + ')\\s*([CD])\\s*$')); if (m2) so = m2; }
      if ((m || so) && cur) {
        let nm, neg, valor, saldo;
        if (m) { nm = m[2].trim(); neg = !!m[3]; valor = toF(m[4]); saldo = sg(m[5], m[6]); }
        else { nm = so[2].trim(); saldo = sg(so[3], so[4]); const d = saldo - (run ?? 0); neg = d < 0; valor = Math.abs(Math.round(d * 100) / 100); }
        if (/(^|\s)-$/.test(nm)) { neg = true; nm = nm.replace(/\s*-$/, ''); }
        let tipo = cur.tipo; if (!tipo) { tipo = nm; nm = ''; }
        const rec = { data: cur.data, tipo, doc: (m || so)[1], partes: nm ? [nm] : [], cont: [], valor, tipoDC: neg ? 'D' : 'C' };
        run = saldo;
        lancs.push(rec); prev = rec; cur = null; pend = []; continue;
      }
      m = l.match(reEf);
      if (m && prev) { if (m[2].trim()) prev.partes.push(m[2].trim()); continue; }
      m = l.match(reDate);
      if (m) { const rs = m[2].trim().replace(/^-$/, ''); const t = fecha(!!rs); cur = { data: m[1], tipo: rs || t || '' }; continue; }
      if (/^-?\s*R\$\s*[\d.,]+$|^-$/.test(l.trim())) continue;
      pend.push(l.trim());
    }
    if (prev) prev.cont.push(...pend);
    if (!lancs.length) return null;
    const out = lancs.map(r => {
      const nomes = [...r.partes, ...r.cont].filter((x, i, a) => a.indexOf(x) === i).join(' ').replace(/-\s+\*\*/g, '-**').replace(/\s+/g, ' ').trim();
      return { data: r.data, historico: r.tipo, complemento: [nomes, 'DOC.: ' + r.doc].filter(Boolean).join(' / '), valor: r.valor, tipo: r.tipoDC };
    });
    const mc = txt.match(/Ag[eê]ncia:\s*(\d+)\s+Conta:\s*([\d\-]+)/), mn = lines.find(x => x.trim()), mj = txt.match(/CNPJ:\s*([\d.\/\-]+)/);
    const mp = txt.match(/Extrato no per[ií]odo de\s+(\d{2}\/\d{2}\/\d{4})\s+[àa]\s+(\d{2}\/\d{2}\/\d{4})/i);
    return { banco: 'CAIXA', agencia: mc ? mc[1] : '', conta: mc ? mc[2] : '', titular: mn ? mn.trim() : '', cnpj: mj ? mj[1].replace(/\D/g, '') : '',
      periodoInicio: mp ? mp[1] : out[0].data, periodoFim: mp ? mp[2] : out[out.length - 1].data, saldoAnterior: sa, saldoFinal: sf, lancamentos: out };
  }

  /* ---------- Bradesco: Extrato de Investimentos (CDB) — movimentos de principal: aplicações e resgates ---------- */
  function bradescoInvest(lines) {
    const txt = lines.join('\n');
    if (!/Extrato de Investimentos/i.test(txt) || !/Produto:/i.test(txt)) return null;
    const reDt = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4}|-)\s+([\d,]+)\s+(.*)$/;
    const nums = s => (s.match(new RegExp(AMT, 'g')) || []).map(toF);
    let sec = '', sa = null, sf = null; const lancs = []; let totalPend = null;
    const prod = (txt.match(/Produto:\s*([^\n]+)/) || [, 'INVESTIMENTO'])[1].trim().split(/\s+-\s+/)[0];
    for (const l of lines) {
      if (/Saldo anterior em/i.test(l)) { sec = 'ant'; continue; }
      if (/^\s*Aplica[cç][oõ]es\s*$/i.test(l)) { sec = 'apl'; continue; }
      if (/Resgates\s*\/\s*Vencimentos/i.test(l)) { sec = 'res'; continue; }
      if (/Saldo final em/i.test(l)) { sec = 'fim'; continue; }
      const mt = l.match(/^\s*Total\s+[\d,]+\s+(.*)$/);
      if (mt) { const n = nums(mt[1]); if (sec === 'ant') sa = n[0]; else if (sec === 'fim') sf = n[0]; continue; }
      const m = l.match(reDt); if (!m || (sec !== 'apl' && sec !== 'res')) continue;
      const n = nums(m[5]);
      if (sec === 'apl') lancs.push({ data: m[1], historico: 'APLICAÇÃO ' + prod, complemento: `Vencimento ${m[2]} · taxa ${m[4]}% ao ano`, valor: n[0], tipo: 'C' });
      else lancs.push({ data: m[3] === '-' ? m[1] : m[3], historico: 'RESGATE ' + prod, complemento: `Aplicação de ${m[1]} · principal ${fmtN(n[0])} · bruto ${fmtN(n[1])} · rendimento ${fmtN(n[2])} · IOF ${fmtN(n[3])} · IRRF ${fmtN(n[4])} · líquido ${fmtN(n[5])}`, valor: n[0], tipo: 'D' });
    }
    if (!lancs.length) return null;
    lancs.sort((a, b) => a.data.split('/').reverse().join('').localeCompare(b.data.split('/').reverse().join('')));
    const mp = txt.match(/Per[ií]odo de:\s*(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+(\d{2}\/\d{2}\/\d{4})/i), mc = txt.match(/Ag[eê]ncia\/conta:\s*(\d+)\s*\|\s*([\d\-]+)/), me = txt.match(/Empresa\/CNPJ:\s*(.+?)\s*\|\s*([\d.\/\-]+)/);
    return { banco: 'BRADESCO', agencia: mc ? mc[1] : '', conta: mc ? mc[2] + ' (' + prod + ')' : prod, titular: me ? me[1].trim() : '', cnpj: me ? me[2].replace(/\D/g, '') : '',
      periodoInicio: mp ? mp[1] : lancs[0].data, periodoFim: mp ? mp[2] : lancs[lancs.length - 1].data, saldoAnterior: sa, saldoFinal: sf, lancamentos: lancs };
  }

  /* ---------- Bradesco conta corrente (e qualquer extrato em colunas Crédito/Débito/Saldo com a data só na 1ª linha do dia) ---------- */
  function bradescoCC(lines, opts = {}) {
    const cab = lines.slice(0, 120).join('\n');
    if (!opts.forcar) {
      if (/Extrato de Investimentos/i.test(cab)) return null;
      if (!/Cr[eé]dito/i.test(cab) || !/D[eé]bito/i.test(cab) || !/Saldo/i.test(cab)) return null;
    }
    const reSaldoAnt = opts.saldoAnt || /SALDO ANTERIOR/i;
    const tokRe = new RegExp('(-?)(' + AMT + ')(-?)(?:\\s?([CD])(?![A-Za-z]))?', 'g');
    const reDate = /^\s*(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.*)$/;
    const anoTxt = (cab.match(/\b(20\d{2})\b/) || [])[1];
    const itens = []; let data = null, cur = null, sa = null, fim = false, pend = [], totBanco = null, ultimoBanco = null;
    for (const l of lines) {
      if (!l.trim() || fim) continue;
      if (opts.ignorar && opts.ignorar.some(r => r.test(l))) continue;
      if (opts.fim && opts.fim.some(r => r.test(l)) && itens.length) { fim = true; continue; }
      if (/Lan[cç]amentos futuros|Saldos? invertidos|Saldo dispon[ií]vel|Limite (de|da)|Os dados acima|SAC\b|Ouvidoria/i.test(l) && itens.length) { fim = true; continue; }
      if (/^\s*(Data\s+(Hist|Lan)|Extrato|Folha|P[aá]gina|Ag[eê]ncia|Nome:|CNPJ|Bradesco|Total\b|Per[ií]odo|Data de|Cliente|Conta\b)/i.test(l) || /Cr[eé]dito\s*\(R\$\)\s+D[eé]bito/i.test(l)) { if (/^\s*Total\b/i.test(l) && itens.length) { fim = true; const ta = [...l.matchAll(tokRe)].map(t => ({ n: toF(t[2]), neg: t[1] === '-' || t[3] === '-' })); if (ta.length >= 3) totBanco = { cred: ta[ta.length - 3].n, deb: ta[ta.length - 2].n, saldo: ta[ta.length - 1].n * (ta[ta.length - 1].neg ? -1 : 1) }; } continue; }
      const m = l.match(reDate);
      let rest = l.trim(), temData = false;
      if (m) { data = m[1]; rest = m[2].trim(); temData = true; }
      if (!data && !reSaldoAnt.test(rest)) continue;
      // valores no fim da linha
      const toks = [...rest.matchAll(tokRe)];
      let fimAmt = rest.length, n = 0;
      const tail = [];
      for (let i = toks.length - 1; i >= 0; i--) { const t = toks[i]; if (rest.slice(t.index + t[0].length, fimAmt).trim() === '') { tail.unshift(t); fimAmt = t.index; n++; } else break; }
      const mk = t => ({ n: toF(t[2]), neg: t[1] === '-' || t[3] === '-' || t[4] === 'D', pos: t[4] === 'C' });
      const texto = rest.slice(0, tail.length ? tail[0].index : rest.length).trim();
      if (reSaldoAnt.test(rest) && tail.length) { const aa = mk(tail[tail.length - 1]); itens.push({ k: 'sa', v: aa.n * (aa.neg ? -1 : 1) }); cur = null; continue; }
      if (/^(SALDO|TOTAL)\b|SALDO (DO DIA|FINAL|DISPON)/i.test(texto) || (!texto && tail.length === 1 && !temData)) { if (tail.length) { const a = mk(tail[tail.length - 1]); itens.push({ k: 'cp', v: a.n * (a.neg ? -1 : 1) }); } cur = null; continue; }
      if (tail.length && texto.length >= 2) {
        const so = /^\d{3,}$/.test(texto), md = so ? null : texto.match(/^(.*?)\s+(\d{3,})$/);
        const a = tail.map(mk);
        let hist = so ? '' : (md ? md[1] : texto).trim();
        // o texto do lançamento pode vir na linha de cima (layout do Bradesco): então a última linha solta é o início deste lançamento e as outras continuam o anterior
        if (!hist && pend.length) hist = pend.pop();
        if (cur) cur.comp.push(...pend);
        pend = [];
        cur = { k: 'tx', data, hist, doc: so ? texto : (md ? md[2] : ''), comp: [], val: a.length >= 2 ? a[a.length - 2] : a[0], saldo: a.length >= 2 ? a[a.length - 1] : null };
        itens.push(cur);
      } else if (rest) pend.push(rest);
    }
    if (cur && pend.length) cur.comp.push(...pend);
    const txs = itens.filter(i => i.k === 'tx');
    if (txs.length < 3) return null;
    const conv = txs.some(t => t.val.neg); // débitos vêm com sinal: o que não tem sinal é crédito
    const palpite = t => t.val.neg ? 'D' : t.val.pos ? 'C' : conv ? 'C' : (/CRED|RECEB|DEPOS|RESGATE|ESTORNO|DEVOL|REMUNER|PIX REC|TED REC|SALDO C\/SAL/i.test(t.hist) ? 'C' : 'D');
    let prev = (itens.find(i => i.k === 'sa') || {}).v ?? null, seg = [], falhas = 0;
    const fechar = alvo => {
      if (alvo == null || prev == null) { seg.forEach(t => t.tipo = t.tipo || palpite(t)); return; }
      const alvoD = Math.round((alvo - prev) * 100);
      const tot = ts => ts.reduce((s, t) => s + (t.tipo === 'C' ? 1 : -1) * Math.round(t.val.n * 100), 0);
      seg.forEach(t => t.tipo = palpite(t));
      if (tot(seg) !== alvoD) {
        const livres = seg.filter(t => !t.val.neg && !t.val.pos);
        if (livres.length && livres.length <= 16) {
          let melhor = null;
          for (let mask = 0; mask < (1 << livres.length); mask++) {
            livres.forEach((t, i) => t.tipo = (mask >> i) & 1 ? 'C' : 'D');
            if (tot(seg) === alvoD) { const dist = livres.filter(t => t.tipo !== palpite(t)).length; if (!melhor || dist < melhor.dist) melhor = { dist, mask }; }
          }
          if (melhor) livres.forEach((t, i) => t.tipo = (melhor.mask >> i) & 1 ? 'C' : 'D'); else { livres.forEach(t => t.tipo = palpite(t)); falhas++; }
        } else falhas++;
      }
      prev = alvo; ultimoBanco = alvo; seg = [];
    };
    for (const it of itens) {
      if (it.k === 'sa') { prev = it.v; seg = []; }
      else if (it.k === 'tx') { seg.push(it); if (it.saldo) fechar(it.saldo.n * (it.saldo.neg ? -1 : 1)); }
      else if (it.k === 'cp') fechar(it.v);
    }
    if (seg.length) { seg.forEach(t => t.tipo = palpite(t)); if (prev != null) prev += seg.reduce((s, t) => s + (t.tipo === 'C' ? 1 : -1) * t.val.n, 0); }
    // verificação linha a linha: cada saldo impresso pelo banco tem de bater com o que foi lido até ali
    let dv = 0, pc = (itens.find(i => i.k === 'sa') || {}).v ?? null;
    for (const t of txs) {
      if (pc != null) pc += (t.tipo === 'C' ? 1 : -1) * t.val.n;
      if (t.saldo && pc != null) { const b = t.saldo.n * (t.saldo.neg ? -1 : 1); if (Math.abs(pc - b) > 0.015) dv++; pc = b; }
    }
    const lancs = txs.map(t => {
      const p = t.data.split('/'); const y = p[2] ? (p[2].length === 2 ? '20' + p[2] : p[2]) : anoTxt; if (!y) return null;
      return { data: `${p[0]}/${p[1]}/${y}`, historico: t.hist, complemento: [t.comp.join(' / ').slice(0, 250), t.doc ? 'DOC.: ' + t.doc : ''].filter(Boolean).join(' / '), valor: t.val.n, tipo: t.tipo };
    }).filter(Boolean);
    if (lancs.length < 3) return null;
    const ac = cab.match(/Ag(?:[eê]ncia)?:?\s*(\d{3,5})/i), cc = cab.match(/(?:Conta(?: corrente)?|CC)\s*:\s*([\d.\-]{4,})/i), mp = cab.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|ate|e|-)\s*(\d{2}\/\d{2}\/\d{4})/i);
    return { banco: opts.banco || acharBanco(cab) || (/bradesco/i.test(cab) ? 'BRADESCO' : 'BANCO'), agencia: ac ? ac[1] : '', conta: cc ? cc[1] : '', titular: '', cnpj: '',
      periodoInicio: mp ? mp[1] : lancs[0].data, periodoFim: mp ? mp[2] : lancs[lancs.length - 1].data, saldoAnterior: (itens.find(i => i.k === 'sa') || {}).v ?? null, saldoFinal: totBanco ? totBanco.saldo : ultimoBanco, totais: totBanco ? { cred: totBanco.cred, deb: totBanco.deb } : null, divergencias: dv, lancamentos: lancs, generico: true };
  }

  /* ---------- layouts aprendidos (ajustados pela IA uma vez e guardados no sistema) ---------- */
  /** Impressão digital do layout: a linha de cabeçalho da tabela (Data / Histórico / Crédito / Débito / Saldo…), só letras. */
  function assinatura(lines) {
    const kw = /data|hist[oó]rico|lan[cç]amento|dcto|docto|documento|cr[eé]dito|d[eé]bito|valor|saldo|descri[cç][aã]o|favorecido/gi;
    for (const l of lines.slice(0, 80)) {
      const ks = new Set((l.match(kw) || []).map(x => nrm(x)));
      if (ks.size >= 3) return nrm(l).replace(/[^a-z]/g, '').slice(0, 90);
    }
    return '';
  }
  const rx = a => (a || []).map(x => { try { return new RegExp(String(x).slice(0, 120), 'i'); } catch (e) { return null; } }).filter(Boolean);
  /** Lê com um layout guardado: {banco, ignorar:[regex], fim:[regex], saldoAnt:regex}. */
  function porLayout(lines, layout) {
    const o = { forcar: true, banco: layout.banco, ignorar: rx(layout.ignorar), fim: rx(layout.fim) };
    if (layout.saldoAnt) { try { o.saldoAnt = new RegExp(String(layout.saldoAnt).slice(0, 120), 'i'); } catch (e) { } }
    return bradescoCC(lines, o);
  }

  /* ---------- modelo aprendido (JSON): descreve um extrato em colunas (data, histórico, valor, saldo) para ler os próximos meses sem IA ---------- */
  const reTokV = /(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})(?:\s*([CD])\b|\s*\(([+-])\))?/g;
  const tokens = txt => [...String(txt).matchAll(reTokV)].map(m => ({ i: m.index, fim: m.index + m[0].length, v: Math.abs(toF(m[1])), neg: m[1][0] === '-' || m[2] === 'D' || m[3] === '-', pos: m[2] === 'C' || m[3] === '+', letra: !!(m[2] || m[3]), raw: m[0] }));
  const anoDoTexto = lines => { for (const l of lines) { const m = l.match(/\d{2}\/\d{2}\/(\d{4})/); if (m) return m[1]; } return null; };
  /** Lê com um modelo {banco, dataFmt:'dmy'|'dm', n:(nº de valores na linha), valorIdx, saldoIdx, sinal:'prefixo'|'letra'|'saldo', ordem:'asc'|'desc', histIdx, ignorar, fim} */
  function porModelo(lines, m) {
    if (!m || !m.n) return null;
    const ano = m.dataFmt === 'dm' ? anoDoTexto(lines) : null; if (m.dataFmt === 'dm' && !ano) return null;
    const reD = m.dataFmt === 'dm' ? /^\s*(\d{2}\/\d{2})(?!\/?\d)\s+(.*)$/ : /^\s*(\d{2}\/\d{2}\/\d{4})\s+(.*)$/;
    const ign = rx(m.ignorar), fimR = rx(m.fim);
    const rows = []; let cur = null, sa = null;
    for (const l of lines) {
      if (!l.trim()) continue;
      if (fimR.some(r => r.test(l)) && rows.length) break;
      const msa = l.match(/saldo\s+(?:anterior|inicial)\D*(-?\d[\d.]*,\d{2})(?:\s*([CD])\b)?/i);
      if (msa && sa == null) { sa = toF(msa[1]) * (msa[2] === 'D' ? -1 : 1); continue; }
      if (ign.some(r => r.test(l))) continue;
      const md = l.match(reD);
      if (md && !/saldo/i.test(md[2])) {
        const tk = tokens(md[2]);
        if (tk.length === m.n) {
          const cel = md[2].slice(0, tk[0].i).trim().split(/\s{2,}/).filter(Boolean);
          cur = { data: m.dataFmt === 'dm' ? md[1] + '/' + ano : md[1], tk, cel, cauda: [] }; rows.push(cur); continue;
        }
        cur = null; continue;
      }
      if (cur && cur.cauda.length < 3 && !/^\s*(p[aá]gina|saldo|total)/i.test(l) && !tokens(l).length) cur.cauda.push(l.trim());
    }
    if (rows.length < 2) return null;
    const lancs = []; let diverg = 0;
    rows.forEach((r, i) => {
      const t = r.tk[m.valorIdx]; if (!t) return;
      let tipo;
      if (m.sinal === 'prefixo') tipo = t.neg ? 'D' : 'C';
      else if (m.sinal === 'letra') tipo = t.neg ? 'D' : 'C';
      else {
        const s = r.tk[m.saldoIdx]; if (!s) return;
        const sv = (s.neg ? -1 : 1) * s.v;
        const outro = m.ordem === 'desc' ? rows[i + 1] : rows[i - 1];
        let ant = outro ? ((r2 => (r2.tk[m.saldoIdx].neg ? -1 : 1) * r2.tk[m.saldoIdx].v)(outro)) : sa;
        if (ant == null) { tipo = null; } else tipo = sv - ant >= 0 ? 'C' : 'D';
        if (tipo && Math.abs(Math.abs(sv - ant) - t.v) > 0.015) diverg++;
      }
      if (!tipo) return;
      const hc = r.cel.filter((c, j) => j === (m.histIdx || 0) || !/^[\d.\-\/]+$/.test(c));
      lancs.push({ data: r.data, historico: (hc[0] || '').trim(), complemento: [...hc.slice(1), ...r.cauda].join(' ').trim(), valor: t.v, tipo });
    });
    if (lancs.length < 2) return null;
    const sOf = r => { const s = m.saldoIdx != null ? r.tk[m.saldoIdx] : null; return s ? (s.neg ? -1 : 1) * s.v : null; };
    const novo = m.ordem === 'desc' ? rows[0] : rows[rows.length - 1];
    const ds = lancs.map(t => t.data).sort((a, b) => C_dn(a) - C_dn(b));
    if (m.ordem === 'desc') lancs.reverse();
    return { banco: m.banco || 'EXTRATO', agencia: '', conta: '', titular: '', cnpj: '', periodoInicio: ds[0], periodoFim: ds[ds.length - 1],
      saldoAnterior: sa, saldoFinal: sOf(novo), divergencias: diverg, lancamentos: lancs, modelo: true };
  }
  /** A partir de um extrato já lido e conferido (por regras ou IA), descobre o modelo em colunas e devolve o JSON; só devolve se reler o mesmo arquivo com ele dá o mesmo resultado. */
  function inferirModelo(lines, res, igual) {
    if (!res || !res.lancamentos || res.lancamentos.length < 3) return null;
    const money = v => { const [a, b] = v.toFixed(2).split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + b; };
    const votos = {}; let tot = 0;
    const idxD = new Map(); lines.forEach((l, i) => { const m = l.match(/^\s*(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.*)$/); if (m) { const k = m[1]; if (!idxD.has(k)) idxD.set(k, []); idxD.get(k).push({ i, rest: m[2] }); } });
    for (const t of res.lancamentos.slice(0, 60)) {
      const alvo = money(t.valor);
      for (const k of [t.data, t.data.slice(0, 5)]) {
        const hit = (idxD.get(k) || []).find(c => c.rest.includes(alvo));
        if (!hit) continue;
        tot++;
        const tk = tokens(hit.rest); const vi = tk.findIndex(x => Math.abs(x.v - t.valor) < 0.005); if (vi < 0) break;
        const sinal = (tk[vi].neg === (t.tipo === 'D') && (tk[vi].neg || tk[vi].letra || tk.length === 1)) ? (tk[vi].letra ? 'letra' : 'prefixo') : 'saldo';
        const si = sinal === 'saldo' || tk.length > 1 ? tk.map((x, j) => j).filter(j => j !== vi).pop() : null;
        const chave = JSON.stringify({ f: k.length === 5 ? 'dm' : 'dmy', n: tk.length, v: vi, s: sinal === 'saldo' ? si : (tk.length > 1 ? si : null), g: sinal });
        votos[chave] = (votos[chave] || 0) + 1; break;
      }
    }
    const melhor = Object.entries(votos).sort((a, b) => b[1] - a[1])[0];
    if (!melhor || melhor[1] < Math.max(3, tot * 0.7)) return null;
    const p = JSON.parse(melhor[0]);
    const dts = res.lancamentos.map(t => t.data);
    const modelo = { banco: res.banco || '', dataFmt: p.f, n: p.n, valorIdx: p.v, saldoIdx: p.s, sinal: p.g, ordem: C_dn(dts[0]) > C_dn(dts[dts.length - 1]) ? 'desc' : 'asc', histIdx: 0, ignorar: [], fim: [] };
    const teste = porModelo(lines, modelo);
    if (!teste || !igual(teste, res)) return null;
    return modelo;
  }

  /* ---------- FixPag / Versapay / PAGME ContaPag (PDF): Data, Número Documento, Histórico, Lançamento (R$), Saldo (R$) — débitos como "-R$ 10,00" ---------- */
  function versapay(lines) {
    const txt = lines.join('\n');
    if (!/ContaPag|PAGME PAGAMENTOS|FIXPag|Versapay/i.test(txt) || !/Lan[cç]amento \(R\$\)\s+Saldo \(R\$\)/i.test(txt)) return null;
    const reAm = /(-?)R\$\s*(-?)(\d{1,3}(?:\.\d{3})*,\d{2})/g;
    const reRow = /^\s*(\d{2}\/\d{2}\/\d{4})\s+(.*)$/;
    const sinalDe = m => (m[1] === '-' || m[2] === '-') ? -1 : 1;
    const rows = []; let sa = null, sfMes = null, pend = [], cur = null;
    for (const l of lines) {
      if (!l.trim()) continue;
      const msa = l.match(/Saldo Anterior\s+(-?)R\$\s*(-?)(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (msa) { if (sa == null) sa = sinalDe(msa) * toF(msa[3]); continue; }
      const mfim = l.match(/Saldo em (\d{2}\/\d{2}\/\d{4})\s+(-?)R\$\s*(-?)(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (mfim) { sfMes = (mfim[2] === '-' || mfim[3] === '-' ? -1 : 1) * toF(mfim[4]); break; }
      if (/PAGME PAGAMENTOS|^\s*Extrato da Conta|Nome do Cliente|Filtros utilizados|^\s*Contas\b|CNJP|Totais do Per[ií]odo|N[uú]mero Documento\s+Hist/i.test(l)) { if (/Totais do Per/i.test(l)) break; continue; }
      const m = l.match(reRow);
      if (m) {
        const ams = [...m[2].matchAll(reAm)];
        if (ams.length < 2) continue;
        const antes = m[2].slice(0, ams[0].index).trim();
        const parts = antes.split(/\s{2,}/).filter(Boolean);
        const doc = parts.length >= 2 ? parts[0] : '', hist = (parts.length >= 2 ? parts.slice(1).join(' ') : parts[0] || '').trim();
        const a = ams[ams.length - 2], b = ams[ams.length - 1];
        cur = { data: m[1], hist, doc: [pend.pop(), doc].filter(Boolean).join(' '), val: sinalDe(a) * toF(a[3]), saldo: sinalDe(b) * toF(b[3]), cauda: [] };
        pend = []; rows.push(cur);
      } else if (/^\s*\d+\s*-\s*\S/.test(l)) { pend = [l.trim()]; }
      else if (cur && cur.cauda.length < 2) cur.cauda.push(l.trim());
    }
    if (rows.length < 3) return null;
    let prev = sa, diverg = 0;
    const lancs = rows.map(r => {
      if (prev != null && Math.abs(prev + r.val - r.saldo) > 0.015) diverg++;
      if (r.doc && r.cauda.length) r.doc = (r.doc + ' ' + r.cauda.join(' ')).trim(); else if (!r.doc && r.cauda.length) r.doc = r.cauda.join(' ');
      const tipo = r.val < 0 ? 'D' : 'C'; prev = r.saldo;
      return { data: r.data, historico: r.hist, complemento: '', valor: Math.abs(r.val), tipo }; // o complemento sai do histórico (o nº/banco do documento não entra)
    });
    const ag = txt.match(/Ag[eê]ncia:?\s*(\d+)\s*-/), cc = txt.match(/Conta (?:ESCROW|[A-Z]+)\s+([\d\-]+)/), nm = txt.match(/Nome do Cliente:\s*(.+?)\s{2,}/), cj = txt.match(/CNJP:\s*([\d.\/\-]+)/), mp = txt.match(/Data Inicial:\s*(\d{2}\/\d{2}\/\d{4})\s+Data Final:\s*(\d{2}\/\d{2}\/\d{4})/);
    return { banco: 'FIXPAG', agencia: ag ? ag[1] : '', conta: cc ? cc[1] : '', titular: nm ? nm[1].trim() : '', cnpj: cj ? cj[1].replace(/\D/g, '') : '',
      periodoInicio: mp ? mp[1] : lancs[0].data, periodoFim: mp ? mp[2] : lancs[lancs.length - 1].data, saldoAnterior: sa, saldoFinal: sfMes != null ? sfMes : prev, divergencias: diverg, lancamentos: lancs };
  }
  /* ---------- Santander Empresas (PDF): Data, Histórico, Documento, Valor (R$), Saldo (R$) — do mais novo para o mais antigo ---------- */
  function santanderPdf(lines) {
    const txt = lines.join('\n');
    if (!/Santander/i.test(txt) || !/Hist[oó]rico\s+Documento\s+Valor \(R\$\)\s+Saldo \(R\$\)/i.test(txt)) return null;
    const reA = new RegExp('^\\s*(\\d{2}/\\d{2}/\\d{4})?\\s*(.*?)\\s+(-?' + AMT + ')\\s+(-?' + AMT + ')\\s*$');
    const rows = [];
    for (const l of lines) {
      if (!l.trim()) continue;
      if (/Saldo de ContaMax|^\s*Saldo\s*$|Posi[cç][aã]o em:/i.test(l)) break;
      if (/Hist[oó]rico\s+Documento|Santander Empresas|^\s*\d+\/\d+\s*$|Per[ií]odos?:|Saldo dispon/i.test(l)) continue;
      const m = l.match(reA);
      if (m && m[1]) rows.push({ tipo: 'A', data: m[1], texto: m[2].trim(), valor: toF(m[3]), saldo: toF(m[4]) });
      else rows.push({ tipo: 'T', texto: l.trim() });
    }
    // as linhas de texto soltas pertencem ao lançamento sem texto: a de cima (início do histórico) e a de baixo (final)
    const livre = i => rows[i] && rows[i].tipo === 'T' && !rows[i].usado;
    const semTexto = r => { const t = r.texto.replace(/\b\d{5,8}\b/g, '').trim(); return !t; };
    rows.forEach((r, i) => { if (r.tipo === 'A' && semTexto(r) && livre(i - 1)) { r.pre = rows[i - 1]; rows[i - 1].usado = true; } });
    rows.forEach((r, i) => { if (r.tipo === 'A' && semTexto(r) && livre(i + 1)) { r.pos = rows[i + 1]; rows[i + 1].usado = true; } });
    const ans = rows.filter(r => r.tipo === 'A');
    if (!ans.length) return null;
    const lancs = ans.map(r => {
      const md = r.texto.match(/\b(\d{5,8})\b/); const doc = md ? md[1] : '';
      const inline = r.texto.replace(/\b\d{5,8}\b/, '').trim();
      const pedacos = [r.pre && r.pre.texto, inline, r.pos && r.pos.texto].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const mh = pedacos.match(/^(Pix (?:Enviado|Recebido)|Pagamento A Fornecedores|Pagamento De Boleto|Tarifa\b[^\d]*?|Transfer[eê]ncia[^\d]*?|Compra\b|Ted\b|Doc\b|Ted Recebida|Cr[eé]dito|D[eé]bito)\s*(.*)$/i);
      const hist = mh ? mh[1].trim() : pedacos.split(' ').slice(0, 3).join(' ');
      const resto = mh ? mh[2].trim() : pedacos.split(' ').slice(3).join(' ');
      const cnpj = (resto.match(/\b(\d{14})\b/) || [])[1];
      const comp = [cnpj ? resto.replace(cnpj, fmtDocSant(cnpj)) : resto, doc ? 'DOC.: ' + doc : ''].filter(Boolean).join(' / ');
      return { data: r.data, historico: hist, complemento: comp, valor: Math.abs(r.valor), tipo: r.valor < 0 ? 'D' : 'C', _saldo: r.saldo, _v: r.valor };
    });
    // do mais antigo para o mais novo; saldo anterior = saldo da linha mais antiga - valor dela
    const ord = lancs[0].data.split('/').reverse().join('') >= lancs[lancs.length - 1].data.split('/').reverse().join('') ? lancs.slice().reverse() : lancs;
    const sa = Math.round((ord[0]._saldo - ord[0]._v) * 100) / 100, sf = ord[ord.length - 1]._saldo;
    ord.forEach(t => { delete t._saldo; delete t._v; });
    const mt = txt.match(/^\s*(.+?)\s{2,}Ag[eê]ncia:\s*(\d+)\s+Conta:\s*([\d\-]+)/m), mp = txt.match(/Per[ií]odos?:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
    return { banco: 'SANTANDER', agencia: mt ? mt[2] : '', conta: mt ? mt[3] : '', titular: mt ? mt[1].trim() : '', cnpj: '',
      periodoInicio: mp ? mp[1] : ord[0].data, periodoFim: mp ? mp[2] : ord[ord.length - 1].data, saldoAnterior: sa, saldoFinal: sf, lancamentos: ord };
  }
  const fmtDocSant = d => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

  /* ---------- Mercado Pago ("EXTRATO DE CONTA": Data, Descrição, ID da operação, Valor, Saldo) ---------- */
  function mercadoPago(lines) {
    const txt = lines.join('\n');
    if (!/EXTRATO DE CONTA/i.test(txt) || !/DETALHE DOS MOVIMENTOS/i.test(txt) || !/Mercado ?Pago/i.test(txt)) return null;
    const mi = txt.match(new RegExp('Saldo inicial:\\s*R\\$\\s*(-?' + AMT + ')')), mf = txt.match(new RegExp('Saldo final:\\s*R\\$\\s*(-?' + AMT + ')'));
    const re = new RegExp('^\\s*(\\d{2})-(\\d{2})-(\\d{4})\\s+(.*?)\\s+(\\d{6,})\\s+R?\\$?\\s*(-?\\s*R?\\$?\\s*' + AMT + ')\\s+R?\\$?\\s*(-?' + AMT + ')\\s*$');
    const lancs = [];
    for (const l of lines) {
      const m = l.match(re); if (!m) continue;
      const v = toF(m[6].replace(/[R$\s]/g, '').replace('-', '')) * (m[6].includes('-') ? -1 : 1);
      lancs.push({ data: `${m[1]}/${m[2]}/${m[3]}`, historico: m[4].trim(), complemento: 'DOC.: ' + m[5], valor: Math.abs(v), tipo: v < 0 ? 'D' : 'C' });
    }
    const mt = txt.match(/EXTRATO DE CONTA\s*\n\s*(.+)\n\s*CPF\/CNPJ:\s*(\d+)\s+Ag[eê]ncia:\s*(\d+)\s+Conta:\s*(\d+)/), mp = txt.match(/Periodo:\s*De\s+(\d{2})-(\d{2})-(\d{4})\s+al\s+(\d{2})-(\d{2})-(\d{4})/i);
    return { banco: 'MERCADO PAGO', agencia: mt ? mt[3] : '', conta: mt ? mt[4] : '', titular: mt ? mt[1].trim() : '', cnpj: mt ? mt[2] : '',
      periodoInicio: mp ? `${mp[1]}/${mp[2]}/${mp[3]}` : '', periodoFim: mp ? `${mp[4]}/${mp[5]}/${mp[6]}` : '', saldoAnterior: mi ? toF(mi[1]) : (lancs.length ? null : 0), saldoFinal: mf ? toF(mf[1]) : (lancs.length ? null : 0), lancamentos: lancs, semMovimento: !lancs.length };
  }

  /* ---------- texto genérico (PDF de outros bancos): linha com data + valor [+ saldo] ---------- */
  function textoGenerico(lines) {
    const txt = lines.slice(0, 60).join('\n');
    const anoTxt = (txt.match(/\b(20\d{2})\b/) || [])[1];
    const reAmt = new RegExp('(-?\\s?' + AMT + ')\\s*([CD]|-)?(?=\\s|$)', 'g');
    const rows = []; let cur = null, sa = null;
    for (const l of lines) {
      const m = l.match(/^\s*(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.*)$/);
      if (m) {
        const resto = m[2];
        const ams = [...resto.matchAll(reAmt)];
        if (/SALDO ANTERIOR/i.test(resto) && ams.length) { const a = ams[ams.length - 1]; if (sa == null) sa = toF(a[1].replace(/[-\s]/g, '')) * (/-/.test(a[1]) || a[2] === 'D' || a[2] === '-' ? -1 : 1); cur = null; continue; }
        if (/^SALDO\b|SALDO (DO DIA|FINAL|DISPON)/i.test(resto.trim())) { cur = null; continue; }
        if (!ams.length) { cur = null; continue; }
        const mk = a => ({ n: toF(a[1].replace(/[-\s]/g, '')), neg: /-/.test(a[1]) || a[2] === 'D' || a[2] === '-', suf: !!a[2] || /-/.test(a[1]) });
        let val, saldo = null;
        if (ams.length >= 2) { val = mk(ams[ams.length - 2]); saldo = mk(ams[ams.length - 1]); } else val = mk(ams[0]);
        const hist = resto.slice(0, ams[ams.length >= 2 ? ams.length - 2 : 0].index).trim();
        cur = { dm: m[1], hist, val, saldo, comp: [] }; rows.push(cur);
      } else if (cur && l.trim() && !/^\s*(p[aá]gina|ag[eê]ncia|conta|saldo)/i.test(l)) cur.comp.push(l.trim());
    }
    if (rows.length < 3) return null;
    let prev = sa, ultBanco = null;
    const lancs = [];
    for (const r of rows) {
      let tipo;
      if (r.val.suf) tipo = r.val.neg ? 'D' : 'C';
      else if (prev != null && r.saldo) { const sv = r.saldo.n * (r.saldo.neg ? -1 : 1); tipo = Math.abs(prev + r.val.n - sv) < 0.015 ? 'C' : 'D'; }
      else tipo = /CRED|RECEB|DEPOS|RESGATE|ESTORNO|PIX REC/i.test(r.hist) ? 'C' : 'D';
      if (r.saldo) { prev = r.saldo.n * (r.saldo.neg ? -1 : 1); ultBanco = prev; } else if (prev != null) prev += tipo === 'C' ? r.val.n : -r.val.n;
      const p = r.dm.split('/'); const y = p[2] ? (p[2].length === 2 ? '20' + p[2] : p[2]) : anoTxt;
      if (!y) continue;
      lancs.push({ data: `${p[0]}/${p[1]}/${y}`, historico: r.hist, complemento: r.comp.join(' / ').slice(0, 300), valor: r.val.n, tipo });
    }
    if (!lancs.length) return null;
    const mp = lines.join('\n').match(/(\d{2}\/\d{2}\/\d{4})\s*(?:a|até|-)\s*(\d{2}\/\d{2}\/\d{4})/i);
    const ac = lines.join('\n').match(/Ag[eê]ncia:?\s*(\d+)/i), cc = lines.join('\n').match(/Conta(?: corrente)?:?\s*([\d.\-]+)/i);
    return { banco: acharBanco(txt) || 'BANCO', agencia: ac ? ac[1] : '', conta: cc ? cc[1] : '', titular: '', cnpj: '',
      periodoInicio: mp ? mp[1] : null, periodoFim: mp ? mp[2] : null, saldoAnterior: sa, saldoFinal: ultBanco, lancamentos: lancs, generico: true };
  }

  /* ---------- Excel / CSV: acha o cabeçalho e as colunas ---------- */
  const SIN = {
    data: /^(data|date|dt|release_date|data (mov|lanc|transacao|movimento|operacao|do lancamento|contabil))\b/,
    hist: /^(historico|descri|lancamento|detalhe|memo|descricao|transaction_type|operacao|nome)/,
    comp: /^(banco|agencia|complemento|favorecido|beneficiario|documento|doc\b|nr doc|n doc|referencia|reference_id|entidade|observa|identificador|id\b|cod)/,
    valor: /^(valor|amount|vlr|transaction_net_amount|montante)/,
    cred: /^(credito|entrada|cred|recebimento|valor a credit)/, deb: /^(debito|saida|deb|pagamento|valor a debit)/,
    saldo: /^(saldo|balance|partial_balance)/, dc: /^(d\/c|dc|c\/d|natureza|tipo lanc)/
  };
  function acharCab(rows) {
    for (let i = 0; i < Math.min(rows.length, 60); i++) {
      const r = (rows[i] || []).map(c => nrm(c instanceof Date ? '' : c));
      const col = {}; const extras = [];
      r.forEach((t, j) => {
        if (!t) return;
        for (const k of ['data', 'saldo', 'cred', 'deb', 'valor', 'dc', 'hist', 'comp']) if (col[k] == null && SIN[k].test(t) && !(k === 'valor' && /saldo/.test(t)) && !(k === 'hist' && /saldo/.test(t))) { col[k] = j; return; }
        if (SIN.comp.test(t)) extras.push(j);
      });
      const temVal = col.valor != null || (col.cred != null && col.deb != null) || col.cred != null || col.deb != null;
      if (col.data != null && temVal) { col.extras = extras.filter(j => j !== col.hist && j !== col.comp); return { i, col }; }
    }
    return null;
  }
  function tabular(rows, nomeArq, Core) {
    const cab = acharCab(rows); if (!cab) return null;
    const { col } = cab; const lancs = []; const sal = []; const saldosLinha = [];
    const cel = (r, j) => j == null ? null : r[j];
    for (let i = cab.i + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (lancs.length && /^(total|ultimos lancamentos|saldos? )/.test(nrm(r.find(c => c !== '' && c != null) ?? ''))) break;
      const d = Core.parseData(cel(r, col.data));
      if (!d) continue;
      { const h0 = String(cel(r, col.hist) ?? '').trim();
        if (/^saldo\b/i.test(h0) && col.saldo != null) { const sv0 = Core.parseValor(cel(r, col.saldo)); if (sv0 != null) saldosLinha.push({ data: d, v: sv0, ant: /anterior/i.test(h0) }); } }
      let v = null, tipo = null;
      if (col.valor != null) { v = Core.parseValor(cel(r, col.valor)); if (v != null) tipo = v < 0 ? 'D' : 'C'; }
      if (v == null || v === 0) {
        const c = col.cred != null ? Core.parseValor(cel(r, col.cred)) : null, db = col.deb != null ? Core.parseValor(cel(r, col.deb)) : null;
        if (c) { v = Math.abs(c); tipo = 'C'; } else if (db) { v = Math.abs(db); tipo = 'D'; }
      }
      if ((v == null || v === 0) && col.comp != null && typeof r[col.comp] === 'number') { v = Math.abs(r[col.comp]); tipo = 'C'; }
      if (v == null || Math.abs(v) < 0.005) continue;
      if (col.dc != null) { const t = String(cel(r, col.dc) ?? '').trim().toUpperCase(); if (/^(D|DEB|S|SAIDA|-)/.test(t)) tipo = 'D'; else if (/^(C|CRED|E|ENTRADA|\+)/.test(t)) tipo = 'C'; }
      const hist = String(cel(r, col.hist) ?? '').trim();
      if (/^saldo\b/i.test(hist)) continue;
      const comp = [col.comp, ...col.extras].filter(j => j != null).map(j => String(cel(r, j) ?? '').trim()).filter(Boolean).join(' / ');
      const sv = col.saldo != null ? Core.parseValor(cel(r, col.saldo)) : null;
      lancs.push({ data: d, historico: hist || comp, complemento: hist ? comp : '', valor: Math.round(Math.abs(v) * 100) / 100, tipo });
      sal.push(sv);
    }
    if (!lancs.length) return null;
    // cabeçalho do arquivo: agência e conta
    const topo = rows.slice(0, cab.i).map(r => (r || []).map(c => String(c ?? '')).join(' | ')).join('\n');
    const ag = topo.match(/ag[eê]ncia\W+(\d+)/i), ct = topo.match(/conta\W+([\d.\-]+)/i);
    // saldos: confere ordem e usa a coluna saldo quando todas as linhas têm
    let saldoAnterior = null, saldoFinal = null;
    if (sal.length && sal.filter(x => x != null).length >= sal.length * 0.9) {
      const nd = Core.dnum, desc = nd(lancs[0].data) > nd(lancs[lancs.length - 1].data);
      const asc = desc ? lancs.map((l, i) => [l, sal[i]]).reverse() : lancs.map((l, i) => [l, sal[i]]);
      const [l0, s0] = asc[0]; const [, sN] = asc[asc.length - 1];
      if (s0 != null && sN != null) { saldoAnterior = Math.round((s0 - (l0.tipo === 'C' ? l0.valor : -l0.valor)) * 100) / 100; saldoFinal = sN; }
      if (desc) lancs.reverse();
    }
    // saldos informados em linhas próprias (Itaú: "SALDO ANTERIOR" e "SALDO TOTAL DISPONÍVEL DIA")
    let divergencias = 0;
    if (saldoAnterior == null && saldosLinha.length) {
      const ant = saldosLinha.filter(x => x.ant).sort((a, b) => Core.dnum(a.data) - Core.dnum(b.data))[0];
      const dias = saldosLinha.filter(x => !x.ant).sort((a, b) => Core.dnum(a.data) - Core.dnum(b.data));
      if (ant) saldoAnterior = ant.v;
      if (dias.length) saldoFinal = dias[dias.length - 1].v;
      if (saldoAnterior != null) divergencias = divDiario(lancs.slice().sort((a, b) => Core.dnum(a.data) - Core.dnum(b.data)), dias, saldoAnterior);
    }
    if (saldosLinha.length && lancs.length > 1 && Core.dnum(lancs[0].data) > Core.dnum(lancs[lancs.length - 1].data)) lancs.reverse();
    const ds = lancs.map(l => l.data).sort((a, b) => Core.dnum(a) - Core.dnum(b));
    const ehItau = /raz[aã]o social/i.test(topo + JSON.stringify(rows[cab.i] || [])) && saldosLinha.length;
    return { divergencias, banco: acharBanco(nomeArq + ' ' + topo) || (ehItau ? 'ITAÚ' : 'BANCO'), agencia: ag ? ag[1] : '', conta: ct ? ct[1] : '', titular: '', cnpj: '',
      periodoInicio: ds[0], periodoFim: ds[ds.length - 1], saldoAnterior, saldoFinal, lancamentos: lancs, generico: true };
  }

  /** CSV → matriz de strings (detecta ; , ou tab; aceita aspas). */
  function csvRows(text) {
    const linhas = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    const am = linhas.slice(0, 5).join('\n');
    const cont = ch => (am.match(new RegExp(ch === '\t' ? '\t' : '\\' + ch, 'g')) || []).length;
    const sep = [';', '\t', ','].sort((a, b) => cont(b) - cont(a))[0];
    return linhas.map(l => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) { const c = l[i];
        if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c; }
      out.push(cur); return out.map(x => x.trim());
    });
  }

  /** Entrada: { linhas (texto), rows (planilha ou null), nome }, Core. Devolve resultado ou null. */
  /* ---------- Cresol ("Extrato de conta corrente": cada dia traz "Saldo do dia"; lançamentos com "+ R$" / "- R$", do mais novo para o mais antigo) ---------- */
  function cresol(lines) {
    const txt = lines.join('\n');
    if (!/Extrato de conta corrente/i.test(txt) || !/Saldo do dia:\s*[+-]\s*R\$/i.test(txt) || !/Totalizadores|Saldo Anterior/i.test(txt)) return null;
    const V = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2})';
    const reAmt = new RegExp('([+-])\\s*R\\$\\s*' + V + '\\s*$');
    const reSd = new RegExp('Saldo do dia:\\s*([+-])\\s*R\\$\\s*' + V, 'i');
    const reDia = /^\s*(\d{2}\/\d{2}\/\d{4})\b/;
    const lancs = [], saldosDia = []; let data = null, pend = null, sa = null;
    for (const l of lines) {
      if (!l.trim()) continue;
      const md = l.match(reDia), ms = l.match(reSd);
      if (md && (ms || !l.replace(md[0], '').trim())) { data = md[1]; pend = md[1]; if (ms) { saldosDia.push({ data, v: toF(ms[2]) * (ms[1] === '-' ? -1 : 1) }); pend = null; } continue; }
      if (ms && pend) { saldosDia.push({ data: pend, v: toF(ms[2]) * (ms[1] === '-' ? -1 : 1) }); pend = null; continue; }
      const msa = l.match(new RegExp('^\\s*Saldo Anterior:?\\s*([+-])?\\s*R\\$\\s*' + V));
      if (msa) { sa = toF(msa[2]) * (msa[1] === '-' ? -1 : 1); break; }
      if (/^\s*Totalizadores/i.test(l)) break;
      const m = l.match(reAmt);
      if (!m || !data) continue;
      const hist = l.slice(0, m.index).replace(/^\s*[(\[]?\S{0,3}[)\]]\s+/, '').replace(/\s+/g, ' ').trim();
      if (!hist) continue;
      lancs.push({ data, historico: hist, complemento: '', valor: toF(m[2]), tipo: m[1] === '-' ? 'D' : 'C' });
    }
    if (lancs.length < 3) return null;
    lancs.reverse(); // do mais antigo para o mais novo
    const mp = txt.match(/Per[ií]odo de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
    const mt = txt.match(/(?:CRESOL\s+)?(.+?)\s+Ag[eê]ncia:\s*(\d+)\s+Conta:\s*([\d.\-]+)/i);
    const ult = saldosDia.slice().sort((a, b) => C_dn(b.data) - C_dn(a.data))[0];
    const mc = txt.match(new RegExp('Saldo da Conta Corrente\\s*([+-])\\s*R\\$\\s*' + V, 'i'));
    const sf = ult ? ult.v : (mc ? toF(mc[2]) * (mc[1] === '-' ? -1 : 1) : null);
    return { banco: 'CRESOL', agencia: mt ? mt[2] : '', conta: mt ? mt[3] : '', titular: mt ? mt[1].replace(/^\s*CRESOL\s+/i, '').trim() : '', cnpj: '',
      periodoInicio: mp ? mp[1] : lancs[0].data, periodoFim: mp ? mp[2] : lancs[lancs.length - 1].data, saldoAnterior: sa, saldoFinal: sf, divergencias: divDiario(lancs, saldosDia, sa), lancamentos: lancs };
  }

  function lerExtrato({ linhas, rows, nome }, Core) {
    if (rows) return tabular(rows, nome, Core);
    return versapay(linhas) || pagbankVendas(linhas) || nubank(linhas) || cresol(linhas) || sicoob(linhas) || caixa(linhas) || banrisul(linhas) || itau(linhas) || sicredi(linhas) || bb(linhas) || caixaNovo(linhas) || bradescoInvest(linhas) || santanderPdf(linhas) || mercadoPago(linhas) || bradescoCC(linhas) || textoGenerico(linhas);
  }

  /* ---------- planilha do cliente: acha cabeçalho e colunas sem IA ---------- */
  const SINP = {
    data: /^(data|dt|vencimento|data (pagamento|do pagamento|vencimento|mov|lanc))/,
    categoria: /^(plano de contas|categoria|classifica|conta contabil|natureza|descricao$|tipo)/,
    descricao: /^(descri|historico|fornecedor|favorecido|entidade|nome|beneficiario|detalhe|produto|referente|lancamento)/,
    complemento: /^(complemento|observa|obs\b|detalhe|referencia)/,
    documento: /^(documento|doc\b|nf|nota|n[ºo°]?\s?doc|numero|cod)/,
    valor: /^(valor|vlr|total|montante|amount)/, entrada: /^(entrada|credito|recebimento|receita)/, saida: /^(saida|debito|pagamento|despesa)/,
    banco: /^(banco|conta banc)/, dc: /^(entrada ?(ou|\/|-) ?saida|e ?\/ ?s|d ?\/ ?c|c ?\/ ?d|natureza do lancamento)$/
  };
  /** Planilha em PDF sem cabeçalho reconhecível: monta linhas [Data, Descrição, Complemento, Valor] a partir das células. */
  function planilhaDeCelulas(rows, Core) {
    const reData = /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/, reDataIni = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+)$/;
    const reVal = /^[-(]?\s*(R\$)?\s*[-(]?\s*\d{1,3}(\.\d{3})*,\d{2}\s*\)?\s*-?\s*[CD]?$/i;
    const out = [['Data', 'Descrição', 'Complemento', 'Valor']]; let atual = null;
    const fecha = () => { if (atual && atual.valor != null) out.push([atual.data, atual.desc.join(' ').trim(), atual.comp.join(' ').trim(), atual.valor]); atual = null; };
    for (const r of rows) {
      const cs = (r || []).map(c => String(c ?? '').trim()).filter(Boolean); if (!cs.length) continue;
      let data = null, resto = cs;
      if (reData.test(cs[0])) { data = cs[0]; resto = cs.slice(1); }
      else { const m = cs[0].match(reDataIni); if (m) { data = m[1]; resto = [m[2], ...cs.slice(1)]; } }
      const vals = resto.filter(c => reVal.test(c)), txt = resto.filter(c => !reVal.test(c));
      if (data) {
        fecha();
        atual = { data, desc: [], comp: [], valor: null };
        if (txt.length) { atual.desc.push(txt[0]); atual.comp.push(...txt.slice(1)); }
        if (vals.length) { const v = Core.parseValor(vals[0]); const neg = /^\(|-|\s*D$/i.test(vals[0].trim()); atual.valor = v == null ? null : (neg && v > 0 ? -v : v); }
      } else if (atual) {
        // linha de continuação (descrição quebrada) ou valor que veio na linha de baixo
        if (atual.valor == null && vals.length) { const v = Core.parseValor(vals[0]); const neg = /^\(|-|\s*D$/i.test(vals[0].trim()); atual.valor = v == null ? null : (neg && v > 0 ? -v : v); }
        if (txt.length && !/^(total|saldo|p[aá]gina|pag\.?\s*\d)/i.test(txt[0])) atual.comp.push(...txt);
      }
    }
    fecha();
    if (out.length > 2) return out;
    // PDF/planilha sem coluna de data: cada linha com texto + valor vira um lançamento sem data
    const sem = [['Data', 'Descrição', 'Complemento', 'Valor']];
    for (const r of rows) {
      const cs = (r || []).map(c => String(c ?? '').trim()).filter(Boolean); if (cs.length < 2) continue;
      const vals = cs.filter(c => reVal.test(c)), txt = cs.filter(c => !reVal.test(c));
      if (!vals.length || !txt.length || /^(total|saldo|p[aá]gina|pag\.?\s*\d)/i.test(txt[0])) continue;
      const v = Core.parseValor(vals[0]); if (v == null) continue; const neg = /^\(|-|\s*D$/i.test(vals[0].trim());
      sem.push(['', txt[0], txt.slice(1).join(' '), neg && v > 0 ? -v : v]);
    }
    return sem.length > 2 ? sem : null;
  }

  /**
   * Relatórios em PDF de sistemas de gestão (salões, clínicas etc.) usados como "planilha do cliente".
   * 1) "Relatório de Contas a Pagar" (Fornecedor | Tipo | Despesa | Entidade | Valor | Juros | Desc. | Valor Pg | Saldo Dev | Venc. | Baixa):
   *    vira linhas [Data da BAIXA, Categoria (despesa), Fornecedor, Valor pago negativo]; nomes quebrados em 2-3 linhas são juntados.
   * 2) Relatórios só de totais (comissões por profissional, faturamento por tipo de pagamento): reconhecidos, mas sem datas por lançamento.
   * Devolve { rows } (com cabeçalho), { resumo: 'texto' } ou null.
   */
  function relatorioPdf(txt) {
    const linhas = (txt || []).map(l => String(l).replace(/\s+$/, ''));
    const tudo = linhas.join('\n');
    const NUM = '-?\\d{1,3}(?:[.,]\\d{3})*[.,]\\d{2}';
    if (/Relat[oó]rio de Contas a (Pagar|Receber)/i.test(tudo) && /Baixa/i.test(tudo)) {
      const receber = /Contas a Receber/i.test(tudo);
      const ent = ((tudo.match(/Entidades?:\s*([^;\n]+)/i) || [])[1] || '').trim();
      const reRow = new RegExp('^(.*?)\\s+(' + NUM + ')\\s+(' + NUM + ')\\s+(' + NUM + ')\\s+(' + NUM + ')\\s+(' + NUM + ')\\s+(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}/\\d{2}/\\d{4})\\s*$');
      const ign = /Relat[oó]rio de Contas|Filtros:|Status:|Tipo Pagamento:|Entidades?:|Fornecedor\s+Tipo|Cliente\s+Tipo|P[aá]gina\s+\d|^\s*Total\b|\(\*\)|CNPJ:|Endere[cç]o|^\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}[.:]\d{2}\s*$/i;
      const TIPO = /(Boleto|D[eé]b\.?\s?Conta|Dinheiro|Cheque|Carteira|A Vista|PIX|Transfer[eê]ncia|Cart[aã]o de Cr[eé]dito|Cart[aã]o de D[eé]bito)/i;
      const rows = [['Data', 'Categoria', 'Fornecedor', 'Valor', 'Documento']];
      const solta = j => j >= 0 && j < linhas.length && linhas[j].trim() && !reRow.test(linhas[j]) && !ign.test(linhas[j]) && !/\d{2}\/\d{2}\/\d{4}/.test(linhas[j]) && (!ent || nrm(linhas[j]).trim() !== nrm(ent));
      for (let i = 0; i < linhas.length; i++) {
        const m = linhas[i].match(reRow); if (!m) continue;
        let pre = m[1];
        if (ent) { const k = pre.toUpperCase().lastIndexOf(ent.toUpperCase()); if (k >= 0) pre = pre.slice(0, k); }
        const sp = pre.split(/(Boleto|D[eé]b\.?\s?Conta|Dinheiro)/i);
        const partes = sp.length >= 3 ? sp : pre.split(TIPO);
        let forn = (partes.length >= 3 ? partes[0] : pre).replace(/\s+/g, ' ').trim();
        let desp = (partes.length >= 3 ? partes.slice(2).join(' ') : '').replace(/\s+/g, ' ').trim();
        if (!forn) {
          // nome em mais de uma linha: o texto da coluna do fornecedor fica na linha de cima e na de baixo
          const viz = [i - 1, i + 1].filter(solta).map(j => linhas[j]);
          const cortes = viz.map(l => l.trim().split(/\s{3,}/));
          forn = cortes.map(c => c[0]).join(' ').trim();
          const dx = cortes.map(c => c.slice(1).join(' ')).join(' ').trim();
          if (dx) desp = (desp + ' ' + dx).trim();
        }
        const pago = Number(m[5].replace(/[.,](\d{2})$/, '#$1').replace(/[.,]/g, '').replace('#', '.'));
        if (!isFinite(pago) || !pago) continue;
        rows.push([m[8], desp, forn, receber ? pago : -pago, '']);
      }
      if (rows.length > 1) return { rows };
    }
    if (/Relat[oó]rio de comiss[oõ]es/i.test(tudo)) return { resumo: 'Relatório de comissões por profissional: traz só o total do período por profissional, sem data de cada pagamento — não dá para casar linha a linha. Use-o para conferir os PIX às profissionais.' };
    if (/Faturamento por Tipo de Pagamento/i.test(tudo)) return { resumo: 'Relatório de faturamento por tipo de pagamento: são totais (cartão, conta bancária), sem lançamentos — serve para conferir as entradas, não para casar linha a linha.' };
    return null;
  }

  /** Relatório "Análise de Vendas por Pedido": a data fica numa linha "Data: dd/mm/aaaa | Venda: n | Nota: n" e cada pedido tem cabeçalho e linha TOTAL próprios. Vira uma linha por pedido [Data, Descrição, Complemento, Valor, Documento]. */
  function vendasPorPedido(rows, Core) {
    rows = rows || [];
    const ehData = r => /^data\s*:\s*\d/i.test(String((r && r[0]) ?? '').trim()) && /^venda\s*:/i.test(String((r && r[1]) ?? '').trim());
    if (!rows.some(ehData)) return null;
    const out = [['Data', 'Descrição', 'Complemento', 'Valor', 'Documento']]; let cur = null, colV = 10;
    const fecha = () => { if (cur && cur.n) out.push([cur.data, 'VENDA ' + cur.venda + (cur.vend ? ' - ' + cur.vend : ''), cur.itens.join('; ').slice(0, 200), Math.round(cur.v * 100) / 100, cur.nota]); cur = null; };
    for (const r of rows) {
      const a = String((r && r[0]) ?? '').trim();
      if (ehData(r)) {
        fecha();
        cur = { data: (a.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/) || [])[1], venda: String(r[1] ?? '').replace(/^\s*venda\s*:\s*/i, '').trim(), nota: String(r[2] ?? '').replace(/^\s*nota\s*:\s*/i, '').trim(), v: 0, n: 0, itens: [], vend: '' };
        continue;
      }
      if (!cur) continue;
      if (/^vendedor$/i.test(a)) { const j = (r || []).findIndex(c => /^venda\b/i.test(String(c ?? '').trim())); if (j >= 0) colV = j; continue; }
      if (/^total\s*:?$/i.test(a)) continue; // total do pedido: somamos os itens, assim não conta em dobro
      if (/^\d+\s*-\s*\d+$/.test(a)) {
        const v = Core.parseValor(r[colV]);
        cur.v += v || 0; cur.n++;
        if (!cur.vend && r[1]) cur.vend = String(r[1]).trim();
        const prod = String(r[3] ?? '').trim(); if (prod) cur.itens.push(prod);
      }
    }
    fecha();
    return out.length > 1 ? out : null;
  }

  function detectarPlanilha(abas, semData) {
    const out = [];
    abas.forEach((a, indice) => {
      const rows = a.rows || [];
      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const r = (rows[i] || []).map(c => nrm(c instanceof Date ? '' : c));
        const col = {};
        r.forEach((t, j) => { if (!t) return; for (const k of ['dc', 'data', 'valor', 'entrada', 'saida', 'banco', 'categoria', 'documento', 'descricao', 'complemento']) if (col[k] == null && !Object.values(col).includes(j) && SINP[k].test(t)) { col[k] = j; return; } });
        if (semData) col.data = null;
        const temVal = col.valor != null || col.entrada != null || col.saida != null;
        if ((semData ? col.data == null : col.data != null) && temVal && (!semData || col.descricao != null || col.categoria != null || col.complemento != null)) {
          const cv = col.valor ?? col.entrada ?? col.saida; const dadosOk = rows.slice(i + 1, i + 40).filter(x => x && (semData ? (x[cv] != null && x[cv] !== '' && (typeof x[cv] === 'number' || /\d[\d.]*,\d{2}|^-?\d+(\.\d+)?$/.test(String(x[cv]).replace(/R\$|\s/g, '')))) : (x[col.data] != null && x[col.data] !== ''))).length;
          if (dadosOk < 2) continue;
          if (col.descricao == null) { const livre = r.findIndex((t, j) => t && !Object.values(col).includes(j) && !/^(item|n|n[ºo°]|nº|seq|sequencia|numero|#|linha|id|ordem)$/.test(t) && !(semData && /^(data|dt)/.test(t)) && !/^entrada ou saida|^tipo/.test(t)); if (livre >= 0) col.descricao = livre; }
          // quando há "descrição" e "categoria" como a mesma coluna, a primeira vira categoria
          if (col.categoria != null && col.categoria === col.descricao) col.descricao = null;
          // data só na primeira linha do dia
          const sem = rows.slice(i + 1, i + 60).filter(x => x && (x[col.valor ?? col.entrada ?? col.saida] != null) && (x[col.data] == null || x[col.data] === '')).length;
          out.push({ indice, usar: true, linhaCabecalho: i, semData: !!semData, dataContinua: !semData && sem > 3, colunas: { categoria: null, descricao: null, complemento: null, documento: null, banco: null, valor: null, entrada: null, saida: null, dc: null, ...col } });
          return;
        }
      }
    });
    if (!out.length && !semData) return detectarPlanilha(abas, true);
    return out.length ? { abas: out } : null;
  }


  /* ---------- relatório de NF-e recebidas (Cofre SIEG) ---------- */
  const decodeHtml = s => String(s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

  /** Relatório de contas a pagar / a receber (qualquer sistema): parcelas com documento, emissão, vencimento e valor, agrupadas por fornecedor/cliente. */
  function lerTitulos(rows, Core) {
    const topo = nrm(rows.slice(0, 15).map(r => (r || []).join(' ')).join(' '));
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const r = (rows[i] || []).map(c => nrm(c instanceof Date ? '' : c));
      const col = {}; const reg = { doc: /^(documento|doc\b|numero|n[ºo°]? ?doc|titulo|nota|nf)/, venc: /^(vencimento|venc\b|dt venc)/, valor: /^(v\.? ?parcela|valor (da )?parcela|valor (do )?titulo|valor|vlr)/, emissao: /^(emissao|dt emissao|data emissao)/, pago: /^(valor pago|pago|vlr pago)/, sit: /^(situacao|status)/, parte: /^(fornecedor|cliente|sacado|credor|nome|razao)/ };
      r.forEach((t, j) => { if (!t) return; for (const k in reg) if (col[k] == null && reg[k].test(t) && !(k === 'doc' && /emiss|venc/.test(t))) { col[k] = j; return; } });
      if (col.venc == null || col.valor == null) continue;
      const titulos = []; let parte = '', tipo = /receber/.test(topo) ? 'R' : /pagar/.test(topo) ? 'P' : '';
      for (const row of rows.slice(i + 1)) {
        if (!row) continue;
        const cs = row.map(c => (c instanceof Date ? '' : String(c ?? '').trim()));
        const m = cs[0] && cs[0].match(/^(fornecedor|cliente|sacado|credor|devedor|favorecido)\s*:?\s*(.*)$/i);
        if (m) { const nome = (m[2] || cs.slice(1).find(Boolean) || '').replace(/^\d+\s*-\s*/, '').trim(); if (nome) parte = nome; if (!tipo) tipo = /cliente|sacado|devedor/i.test(m[1]) ? 'R' : 'P'; continue; }
        const venc = Core.parseData(row[col.venc]); const valor = Core.parseValor(row[col.valor]);
        if (!venc || valor == null || valor <= 0) continue;
        const sit = col.sit != null ? String(row[col.sit] ?? '').trim() : '';
        if (/cancel/i.test(sit)) continue;
        const nome = col.parte != null && String(row[col.parte] ?? '').trim() && !/^\d{1,2}\/\d/.test(String(row[col.parte])) ? String(row[col.parte]).replace(/^\d+\s*-\s*/, '').trim() : parte;
        if (!nome) continue;
        titulos.push({ i: titulos.length, tipo: tipo || 'P', parte: nome, doc: String(row[col.doc] ?? '').replace(/\.0$/, '').trim(), emissao: col.emissao != null ? (Core.parseData(row[col.emissao]) || '') : '', venc,
          valor: Math.round(valor * 100) / 100, pago: col.pago != null ? (Core.parseValor(row[col.pago]) || 0) : 0, sit });
      }
      if (titulos.length < 1) return null;
      const grupos = new Map();
      titulos.forEach(t => { const k = t.parte + '|' + t.doc; (grupos.get(k) || grupos.set(k, []).get(k)).push(t); });
      grupos.forEach(g => { g.sort((a, b) => Core.dnum(a.venc) - Core.dnum(b.venc)); g.forEach((t, k) => { t.parc = k + 1; t.np = g.length; }); });
      return { titulos, tipoTit: tipo || 'P', partes: new Set(titulos.map(t => t.parte)).size };
    }
    return null;
  }
  /**
   * Lê o texto de UMA nota fiscal em PDF e identifica o modelo: NF-e (DANFE, modelo 55), NFC-e (cupom, modelo 65) ou NFS-e (DANFSe nacional ou municipal).
   * linhas = texto do PDF (camada de texto ou OCR). opc = { cnpj: CNPJ do cliente, ocr: true se veio de OCR }.
   * Devolve no mesmo formato do leitor do SIEG: { notas:[{...}], canceladas, destino, tipo, emitente, modelo, doc:true } ou null se não parece nota fiscal.
   * O modelo e os dados confiáveis saem da CHAVE DE ACESSO (modelo = dígitos 21-22; CNPJ do emitente, série, número e AAMM também moram nela).
   */
  function lerNotaFiscal(linhas, Core, opc) {
    opc = opc || {};
    const L = (linhas || []).map(l => String(l == null ? '' : l).replace(/\s+$/, '')).filter(l => l.trim());
    const N = L.map(l => Core.norm(l));
    const T = N.join('\n');
    if (T.replace(/\s/g, '').length < 40) return null;
    const dig = s => String(s || '').replace(/\D/g, '');
    const cnpjCli = dig(opc.cnpj);
    const avisos = [];
    const money = s => (String(s).replace(/(\d)\s+,(\d{2})(?!\d)/g, '$1,$2').match(/\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)|\d+,\d{2}(?!\d)/g) || []).map(x => Core.parseValor(x)).filter(v => v != null);
    const fmtCnpj = d => d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;
    const dv = ch => { let p = 2, s = 0; for (let i = ch.length - 2; i >= 0; i--) { s += +ch[i] * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return (r < 2 ? 0 : 11 - r) === +ch[ch.length - 1]; };
    const ufOk = c => +c.slice(0, 2) >= 11 && +c.slice(0, 2) <= 53;
    const dataBR = s => {
      s = String(s || '');
      let m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[1]}/${m[2]}/${m[3]}`;
      m = s.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
    };
    const datasDe = s => { const r = []; const re = /(\d{2}\/\d{2}\/\d{4})|(\d{4}-\d{2}-\d{2})/g; let m; while ((m = re.exec(String(s)))) r.push(dataBR(m[0])); return r; };

    /* ---------- 1) chave de acesso ---------- */
    // OCR troca alguns símbolos por dígitos: só mexe em linhas que são quase só números
    const limpaDig = l => { const sp = l.replace(/\s/g, ''); const nd = (sp.match(/\d/g) || []).length; return sp.length >= 20 && nd / sp.length >= 0.7 ? sp.replace(/[$S]/g, '5').replace(/[)\]|lI!]/g, '1').replace(/[Oo]/g, '0').replace(/B/g, '8') : sp; };
    const CONF = { '0': '869', '8': '036', '6': '085', '9': '08', '1': '7', '7': '1', '5': '6', '3': '8', '2': '7' };
    const reparar = d => {
      const achados = [];
      for (let k = 0; k < 44; k++) for (const t of (CONF[d[k]] || '')) { const w = d.slice(0, k) + t + d.slice(k + 1); if (dv(w) && /^(55|65)$/.test(w.slice(20, 22)) && ufOk(w)) achados.push(w); }
      return achados.length === 1 ? achados[0] : null;
    };
    const cands = [];
    const tenta = d => {
      if (d.length === 44) cands.push({ d, ok: dv(d) });
      else if (d.length === 50) cands.push({ d, nfse: true });
      else if (d.length > 44 && d.length <= 70) {
        let achou = false, prim = null;
        for (let k = 0; k + 44 <= d.length; k++) { const w = d.slice(k, k + 44); const mod = /^(55|65)$/.test(w.slice(20, 22)) && ufOk(w); if (mod && !prim) prim = w; if (dv(w) && mod) { cands.push({ d: w, ok: true }); achou = true; break; } }
        if (!achou && prim) cands.push({ d: prim, ok: false });
      }
    };
    for (let i = 0; i < L.length; i++) {
      const a = limpaDig(L[i]).replace(/\D/g, '');
      tenta(a);
      // linha misturada (ex.: "HAVAN CEP: 92020-0476 4326 0879 ... $500 ..."): pega só a sequência de grupos numéricos
      { let run = []; const runs = []; for (const tk of L[i].split(/\s+/)) { if (/^[0-9$S)\]|lIOo]{2,6}$/.test(tk) && /\d/.test(tk)) run.push(tk); else { if (run.length >= 5) runs.push(run); run = []; } } if (run.length >= 5) runs.push(run);
        for (const r of runs) tenta(r.join('').replace(/[$S]/g, '5').replace(/[)\]|lI]/g, '1').replace(/[Oo]/g, '0').replace(/\D/g, '')); }
      if (i + 1 < L.length && a.length >= 16 && a.length < 44) { const b = limpaDig(L[i + 1]).replace(/\D/g, ''); if (b.length >= 10) tenta(a + b); }
    }
    let ch = cands.find(c => c.ok) || cands.find(c => c.nfse) || null;
    let chaveRuim = null;
    if (!ch) {
      const c44 = cands.find(c => c.d.length === 44);
      if (c44) { const rep = reparar(c44.d); if (rep) { ch = { d: rep, ok: true, reparada: true }; } else chaveRuim = c44.d; }
    }

    /* ---------- 2) modelo ---------- */
    const T2 = T.replace(/SUBSTITUICAO\s+(?:DA|DE)\s+NFC-?E[^\n]*/g, ' ').replace(/VENDA\s+NFC-?E/g, ' ');
    const ehNfse = /DANFSE|\bNFS-?E\b|NOTA FISCAL DE SERVICO/.test(T2) && !/\bDANFE\b/.test(T2.replace(/DANFSE/g, ''));
    const s65 = (T2.match(/\bNFC-?E\b|NOTA FISCAL DE CONS|VIA CONSUMIDOR|CONSULTE PELA CHAVE|CONSUMIDOR (?:CPF|CNPJ|NAO IDENT)|CONSUMIDOR\s*-\s*CPF|CONSUMIDOR\s*:|QR ?CODE|\bNFC-./g) || []).length;
    const s55 = (T2.match(/\bDANFE\b|DESTINATARIO\s*\/?\s*REMETENTE|CALCULO DO IMPOSTO|DADOS DOS PRODUTOS|TRANSPORTADOR\s*\/?\s*VOLUMES|RECEBEMOS DE/g) || []).length;
    let tipo = null, modelo = null, viaChave = false;
    if (ch && !ch.nfse && ch.ok) { const m = ch.d.slice(20, 22); if (m === '55') tipo = 'NFE'; else if (m === '65') tipo = 'NFCE'; viaChave = !!tipo; }
    if (!tipo) tipo = ehNfse ? 'NFSE' : (s65 > s55 && s65 >= 2 ? 'NFCE' : (s55 >= 2 ? 'NFE' : (s65 >= 2 ? 'NFCE' : null)));
    if (!tipo && ch && ch.nfse) tipo = 'NFSE';
    if (!tipo && chaveRuim && /^(55|65)$/.test(chaveRuim.slice(20, 22)) && ufOk(chaveRuim)) tipo = chaveRuim.slice(20, 22) === '55' ? 'NFE' : 'NFCE';
    if (!tipo) return null;
    modelo = tipo === 'NFE' ? '55' : tipo === 'NFCE' ? '65' : 'NFS-e';
    if (viaChave && tipo === 'NFE' && s65 > s55 + 1 && !/NFC-?E/.test(T2)) avisos.push('Layout de cupom, mas a chave de acesso indica NF-e (modelo 55).');
    if (viaChave) { const guess = ehNfse ? 'NFSE' : (s65 > s55 && s65 >= 2 ? 'NFCE' : (s55 >= 2 ? 'NFE' : null)); if (guess && guess !== tipo && guess !== 'NFSE') avisos.push(`O papel parece ${guess === 'NFE' ? 'DANFE (NF-e)' : 'cupom NFC-e'}, mas a chave de acesso é de modelo ${modelo}. Valeu a chave.`); }
    if (opc.ocr) avisos.push('Nota lida por OCR (imagem/foto): confira valor, data e número com o PDF.');
    if (chaveRuim) avisos.push('A chave de acesso lida por OCR não confere (dígito verificador): o CNPJ e o número abaixo podem estar errados.');
    if (ch && ch.reparada) avisos.push('A chave de acesso tinha um dígito mal lido pelo OCR e foi corrigida pelo dígito verificador.');
    if (/NOTA FISCAL (?:ELETRONICA )?CANCELADA|NFS-?E CANCELADA|SITUACAO[^\n]{0,30}CANCELAD|CANCELAMENTO DE NFE HOMOLOGADO|\bNF-?E CANCELADA/.test(T2)) return { notas: [], canceladas: 1, destino: '', tipo, emitente: '', modelo, doc: true };

    const cnpjRe = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g;
    const cnpjsTexto = [...new Set((T.match(cnpjRe) || []).map(dig))];
    const proximo = (alvo, minIgual) => cnpjsTexto.find(c => { let n = 0; for (let k = 0; k < 14; k++) if (c[k] === alvo[k]) n++; return n >= minIgual; });
    const chaveOk = ch && !ch.nfse && (ch.ok || ch.reparada);
    const campo = { cnpj: '', num: '', serie: '', aamm: '' };
    if (ch && !ch.nfse) {
      campo.cnpj = ch.d.slice(6, 20); campo.serie = String(+ch.d.slice(22, 25)); campo.num = String(+ch.d.slice(25, 34)); campo.aamm = ch.d.slice(2, 6);
    } else if (chaveRuim) {
      campo.cnpj = proximo(chaveRuim.slice(6, 20), 12) || chaveRuim.slice(6, 20); campo.num = String(+chaveRuim.slice(25, 34));
    }
    const norm1 = (s) => String(s || '').trim();
    const primeiroMoney = s => { const m = money(s); return m.length ? m[0] : null; };
    const ultimoMoney = s => { const m = money(s); return m.length ? m[m.length - 1] : null; };
    const idxL = re => N.findIndex(l => re.test(l));
    /** valores monetários da linha do rótulo (depois dele) ou, se não houver, da(s) linha(s) seguinte(s) */
    const valoresApos = (re, ate = 2) => {
      const i = idxL(re); if (i < 0) return null;
      const m = N[i].match(re); const mesma = money(N[i].slice(m.index + m[0].length));
      if (mesma.length) return mesma;
      for (let k = 1; k <= ate && i + k < N.length; k++) { const v = money(N[i + k]); if (v.length) return v; }
      return null;
    };
    const mascara = (txt, alvo) => { const d = String(txt).replace(/[xX]/g, '*').replace(/[^0-9*]/g, ''); if (!alvo || d.length !== alvo.length) return false; for (let k = 0; k < d.length; k++) if (d[k] !== '*' && d[k] !== alvo[k]) return false; return /\d/.test(d); };

    let num = campo.num, serie = campo.serie, data = '', valor = null, bruto = null, liquido = null, cnpj = campo.cnpj, razao = '', destino = '', desc = '', natureza = '', parcelas = [], substitui = null;

    /* ---------- NF-e (DANFE) ---------- */
    if (tipo === 'NFE') {
      if (!chaveOk) {
        const i = N.findIndex(l => /^\W*N[O°º]\.?\s*\d{1,3}(?:\.\d{3})+\s*$|^\W*N[O°º]\.?\s*\d{3,9}\s*$/.test(l));
        if (i >= 0) num = String(+dig(N[i]));
        const s = N.map(l => l.match(/^\W*SERIE:?\s*(\d{1,3})\b/)).find(Boolean); if (s) serie = s[1];
      }
      const m = T.match(/RECEBEMOS DE (.+?) OS PRODUTOS/);
      if (m) razao = Core.norm(m[1]);
      if (!razao) {
        const nomeCli = Core.norm(opc.nome || '').split(' ').slice(0, 2).join(' ');
        const i0 = idxL(/IDENTIFICACAO DO EMITENTE|\bDANFE\b/); const lim = i0 >= 0 ? Math.min(N.length, i0 + 14) : Math.min(N.length, 20);
        const alvo = N.slice(0, lim).find(l => /\b(LTDA|S\/?A|S\.A\.?|EIRELI|EPP|MEI|ME)\b/.test(l) && !/RECEBEDOR|MERCADORIA|RECEBEMOS|INSCRICAO/.test(l) && !(nomeCli && l.includes(nomeCli)));
        if (alvo) razao = alvo.replace(/\s{2,}.*$/, '').replace(/\s+(DANFE|NF-?E).*$/, '').trim();
      }
      const iNat = idxL(/^NATUREZA DA OPERACAO/); if (iNat >= 0) natureza = (N[iNat + 1] || '').replace(/\s{2,}.*$/, '').replace(/\s+\d{10,}.*$/, '').trim();
      // data de emissão: linha abaixo do rótulo "DATA DA EMISSÃO" (DANFE)
      const iD = idxL(/DATA DE? ?EMISSAO/);
      if (iD >= 0) for (let k = 0; k <= 2 && !data; k++) { const d = datasDe(N[iD + k] || ''); if (d.length) data = d[0]; }
      if (!data) { const d = datasDe(T); data = d[0] || ''; }
      const v = valoresApos(/VALOR TOTAL DA NOTA/, 2); if (v) valor = v[v.length - 1];
      if (valor == null) { const v2 = valoresApos(/VALOR TOTAL (?:DOS )?PRODUTOS/, 2); if (v2) { valor = v2[v2.length - 1]; avisos.push('Não achei o "Valor total da nota"; usei o valor total dos produtos.'); } }
      bruto = valor;
      // fatura / duplicatas
      const iF = idxL(/^FATURA\b|^\W*FATURA$/);
      if (iF >= 0) { const trecho = N.slice(iF, iF + 6).join(' '); const re = /\b(\d{3})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{4})/g; let m2; while ((m2 = re.exec(trecho))) parcelas.push({ parc: m2[1], valor: Core.parseValor(m2[2]), venc: m2[3] }); }
      const ms = T.match(/SUBSTITUICAO DA NFC-?E\s*(\d+)(?:\s*SERIE\s*(\d+))?/) || T.match(/NFC-?E\s*(\d{3,9})\s*SERIE\s*(\d+)/);
      if (/SUBSTITUICAO\s+(?:DA|DE)\s+NFC-?E/.test(T)) { const mm = T.match(/SUBSTITUICAO\s+(?:DA|DE)\s+NFC-?E\s*(?:N[O°º]?\s*)?(\d{1,9})?(?:\s*SERIE\s*(\d+))?/); substitui = { num: mm && mm[1] ? String(+mm[1]) : '', serie: mm && mm[2] ? String(+mm[2]) : '' }; }
      if (/DEVOLUCAO|RETORNO|REMESSA|TRANSFERENCIA/.test(natureza)) avisos.push('Natureza da operação: ' + natureza + ' — confirme se é compra mesmo.');
      // destinatário: primeiro CNPJ do texto que não é o do emitente
      destino = (cnpjCli && cnpjsTexto.includes(cnpjCli)) ? cnpjCli : (cnpjsTexto.find(c => c !== cnpj && c.length === 14) || '');
      if (!cnpj) { cnpj = cnpjsTexto.find(c => c !== destino) || ''; }
    }

    /* ---------- NFC-e (cupom) ---------- */
    if (tipo === 'NFCE') {
      if (!chaveOk) {
        const mn = T.match(/(?:\b[NW]\w?[UM]ERO|NFC-?E\s*N\S{0,3})\s*:?\s*(\d{3,9})/); if (mn) num = String(+mn[1]);
        const ms = T.match(/SERIE\s*:?\s*(\d{1,3})/); if (ms) serie = String(+ms[1]);
      }
      const md = T.match(/E\w{1,2}ISS\w{0,3}\W{0,3}(\d{2}\/\d{2}\/\d{4})/); if (md) data = md[1];
      if (!data) { const d = datasDe(T); data = d[0] || ''; }
      const iCnpj = N.findIndex(l => /CNPJ|CPF|CHPJ|CNP\b/.test(l));
      const lim = iCnpj > 0 ? iCnpj : Math.min(N.length, 6);
      const nomeLinha = N.slice(0, lim + 1).filter(l => (l.match(/[A-Z]/g) || []).length >= 8 && !/DOCUMENTO AUXILIAR|NOTA FISCAL|CNPJ|CPF|CHPJ|IE |INSCRICAO|FONE|^AV |^RUA |^R\. /.test(l)).sort((a, b) => (/\b(LTDA|S\/?A|EIRELI|EPP|ME)\b/.test(b) ? 1 : 0) - (/\b(LTDA|S\/?A|EIRELI|EPP|ME)\b/.test(a) ? 1 : 0))[0];
      if (nomeLinha) razao = nomeLinha.replace(/^[^A-Z0-9]+/, '').replace(/^\d+\s*-\s*/, '').replace(/\s+F[FE]?:?\s*\d+.*$/, '').trim();
      let v = null;
      const m1 = T.match(/ALOR\s+\S?\s*PAGAR[^\d\n]{0,8}(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/); if (m1) v = Core.parseValor(m1[1]);
      if (v == null) { const m2 = T.match(/ALOR TOTAL[^\d\n]{0,8}(\d{1,3}(?:\.\d{3})*[,.]\d{2})/); if (m2) v = Core.parseValor(m2[1].replace(/\.(\d{2})$/, ',$1')); }
      if (v == null) { const m3 = T.match(/(?:^|\n)\s*TOTAL\s+\S{0,3}\s*(\d{1,3}(?:\.\d{3})*,\d{2})/); if (m3) v = Core.parseValor(m3[1]); }
      const iPg = idxL(/FORMA DE PAGAMENTO/); let pago = null; if (iPg >= 0) for (let k = 0; k <= 1 && pago == null; k++) { const m = money(N[iPg + k] || ''); if (m.length) pago = m[m.length - 1]; }
      if (v == null) v = pago;
      valor = v; bruto = v;
      if (pago != null && v != null && Math.abs(pago - v) > 0.005) avisos.push(`Total do cupom (R$ ${Core.fmt(v)}) diferente do valor pago (R$ ${Core.fmt(pago)}): confira no PDF.`);
      // consumidor
      const mc = T.match(/ONSU\w{0,3}DOR\s*(?:-\s*)?(CPF|CNPJ)?\s*:?\s*([0-9*xX.,\/-]{11,22})/);
      if (mc) {
        const dd = mc[2].replace(/[xX]/g, '*').replace(/[^0-9*]/g, '');
        if (dd.length === 14 && !dd.includes('*')) destino = dd;
        else if (cnpjCli && mascara(mc[2], cnpjCli)) destino = cnpjCli;
        else if (dd.length === 11 && !dd.includes('*')) { destino = ''; avisos.push('Cupom emitido no CPF ' + dd.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') + ' (pessoa física, não no CNPJ da empresa): confirme se é gasto da empresa.'); }
        else avisos.push('CPF/CNPJ do consumidor mascarado no cupom (' + mc[2].trim() + ') e não bate com o CNPJ do cliente.');
      } else avisos.push('Cupom sem CPF/CNPJ do consumidor identificado: não comprova que a compra é da empresa — confirme a despesa.');
    }

    /* ---------- NFS-e ---------- */
    if (tipo === 'NFSE') {
      if (ch && ch.nfse) { cnpj = ch.d.slice(9, 23); num = String(+ch.d.slice(23, 36)); }
      else {
        const i = idxL(/NUMERO DA NFS-?E/); if (i >= 0) { const m = (N[i + 1] || '').match(/\b(\d{1,9})\b/); if (m) num = String(+m[1]); }
        if (!num) { const m = T.match(/NFS-?E\s*(?:N[O°º]?\.?\s*)?:?\s*(\d{1,9})/); if (m) num = String(+m[1]); }
      }
      serie = '';
      // data de emissão = última data da linha de valores logo abaixo do rótulo
      const iD = idxL(/DATA E HORA DA EMISSAO DA NFS-?E|DATA\s*\/?\s*HORA EMISSAO|DATA DE EMISSAO/);
      if (iD >= 0) for (let k = 0; k <= 2 && !data; k++) { const d = datasDe(N[iD + k] || ''); if (d.length) data = d[d.length - 1]; }
      if (!data) { const d = datasDe(T); data = d[0] || ''; }
      // razão do prestador
      const iNome = idxL(/^NOME ?\/ ?NOME EMPRESARIAL/);
      if (iNome >= 0 && N[iNome + 1]) razao = L[iNome + 1].split(/\s{2,}/)[0].trim();
      if (!razao && cnpj) { const fm = fmtCnpj(cnpj); const i = N.findIndex(l => l.includes(fm) || l.includes(cnpj)); if (i > 0) razao = L[i - 1].split(/\s{2,}/)[0].replace(/\s+-\s+.*$/, '').trim(); }
      if (!razao) razao = (L[0] || '').split(/\s{2,}/)[0].trim();
      // tomador
      const iT = idxL(/TOMADOR/);
      const nTom = iT >= 0 ? N.slice(iT, iT + 8).join(' ').match(cnpjRe) : null;
      destino = nTom ? dig(nTom.find(c => dig(c) !== cnpj) || nTom[0]) : (cnpjsTexto.find(c => c !== cnpj) || '');
      if (cnpjCli && cnpjsTexto.includes(cnpjCli) && destino !== cnpjCli && cnpj !== cnpjCli) destino = cnpjCli;
      // valores
      let v = valoresApos(/VALOR DA OPERACAO/, 2) || valoresApos(/^VALOR DO SERVICO\b/, 2) || valoresApos(/^VALOR TOTAL(?! DA NFS)\b/, 2);
      if (v) bruto = v[0];
      const iL = idxL(/VALOR LIQUIDO/);
      if (iL >= 0) { let row = null; for (let k = 1; k <= 2 && !row; k++) { const m = money(N[iL + k] || ''); if (m.length) row = m; } if (row) liquido = row.length === 4 ? row[1] : row[row.length - 1]; }
      if (bruto != null && liquido != null && liquido > bruto + 0.005) liquido = bruto;
      valor = liquido != null ? liquido : bruto;
      if (bruto != null && liquido != null && bruto - liquido > 0.005) avisos.push(`NFS-e com retenções de R$ ${Core.fmt(Math.round((bruto - liquido) * 100) / 100)} (serviço R$ ${Core.fmt(bruto)}, líquido R$ ${Core.fmt(liquido)}): o pagamento no banco deve ser o valor líquido; guias de retenção (IRRF, PIS/COFINS/CSLL, ISS) saem à parte.`);
      const iDs = idxL(/^DESCRICAO DO SERVICO/); if (iDs >= 0) desc = (L[iDs + 1] || '').replace(/\s{2,}.*$/, '').trim().slice(0, 140);
      const iV = idxL(/^PARCELA|N[O°º] PARCELA/); if (iV >= 0) { const mm = N.slice(iV, iV + 4).join(' ').match(/\b(\d{2}\/\d{2}\/\d{4})\b\s+(\d{1,3}(?:\.\d{3})*,\d{2})/); if (mm) parcelas.push({ parc: '1', valor: Core.parseValor(mm[2]), venc: mm[1] }); }
      if (!parcelas.length) { const mv = T.match(/VENCIMENTO[^\n]{0,30}?(\d{2}\/\d{2}\/\d{4})/); if (mv) parcelas.push({ parc: '1', valor, venc: mv[1] }); }
    }

    /* ---------- conferências ---------- */
    if (chaveOk && ch.d && data) {
      const aamm = ch.d.slice(2, 6), ym = '20' + aamm.slice(0, 2), mm = aamm.slice(2);
      const [dd, MM, yy] = data.split('/');
      if (MM !== mm || yy !== ym) { avisos.push(`Data lida (${data}) não bate com o mês da chave de acesso (${mm}/${ym}); usei o mês da chave.`); data = `${dd}/${mm}/${ym}`; }
    }
    if (chaveRuim && data) { const mm0 = chaveRuim.slice(4, 6), yy0 = '20' + chaveRuim.slice(2, 4); const [, M0, Y0] = data.split('/'); if (M0 !== mm0 || Y0 !== yy0) avisos.push(`A data lida (${data}) não bate com o mês da chave (${mm0}/${yy0}): confira no PDF qual está certa.`); }
    if (!cnpj) avisos.push('Não consegui ler o CNPJ do emitente (a chave de acesso não foi lida). Sem ele, o casamento com o extrato usa só valor e nome.');
    if (!num) avisos.push('Não consegui ler o número da nota.');
    if (valor == null) avisos.push('Não consegui ler o valor da nota.');
    if (!data) avisos.push('Não consegui ler a data de emissão.');
    if (cnpj && cnpj.length === 14 && cnpjCli && cnpj === cnpjCli && tipo !== 'NFSE') avisos.push('O emitente é o próprio cliente: confira se não é nota de venda.');
    if (razao && !/[A-Z]{4,}/.test(razao)) razao = '';
    if (!razao) razao = 'EMITENTE ' + fmtCnpj(cnpj || '');
    const nota = { i: 0, tipo, modelo, num: String(num || ''), serie, valor: valor == null ? null : Math.round(valor * 100) / 100, bruto: bruto == null ? null : Math.round(bruto * 100) / 100, data, cnpj: cnpj || '', razao: norm1(razao).toUpperCase(), fantasia: '', destino, chave: ch ? ch.d : (chaveRuim || ''), desc, natureza, parcelas, substitui, avisos, ocr: !!opc.ocr };
    if (!nota.data || nota.valor == null) { if (!nota.valor && !nota.data) return { notas: [], canceladas: 0, destino, tipo, emitente: '', modelo, doc: true, vazia: nota }; }
    return { notas: [nota], canceladas: 0, destino, tipo, emitente: (cnpjCli && nota.cnpj === cnpjCli && tipo === 'NFSE') ? cnpjCli : '', modelo, doc: true };
  }
  function lerSieg(rows, Core) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = (rows[i] || []).map(c => nrm(c instanceof Date ? '' : c));
      const col = k => r.findIndex(t => k.test(t));
      const c = { num: col(/^num/), valor: col(/^valor/), data: col(/^data emiss/), cnpj: col(/^cnpj emit/), fant: col(/^nome fant\w*\.? emit/), razao: col(/^razao soc\w*\.? emit/), dest: col(/^cnpj dest/), status: col(/^status/), evento: col(/^tipo do evento/), chave: col(/^chave/) };
      // CT-e do SIEG não traz "Num" nem "Valor": o número sai da chave de acesso e o valor fica vazio (serve para identificar a transportadora pelo CNPJ)
      if (c.data < 0 || c.cnpj < 0 || (c.num < 0 && c.chave < 0)) continue;
      const cab = r.join(' ');
      const tipo = /ct-?e/.test(cab) ? 'CTE' : /nfs-?e/.test(cab) ? 'NFSE' : 'NFE';
      if (tipo !== 'CTE' && (c.num < 0 || c.valor < 0)) continue;
      const notas = []; const vistos = new Set(); let canceladas = 0; const dests = {};
      for (const row of rows.slice(i + 1)) {
        if (!row) continue;
        const data = Core.parseData(row[c.data]); const valor = c.valor >= 0 ? Core.parseValor(row[c.valor]) : null;
        if (!data || (tipo !== 'CTE' && (valor == null || valor <= 0))) continue;
        const chave = String(row[c.chave] ?? '').replace(/\D/g, ''); if (chave && vistos.has(chave)) continue; vistos.add(chave);
        if (tipo === 'CTE' && chave.length !== 44) continue;
        const cancel = /cancel/.test(nrm((row[c.status] ?? '') + ' ' + (row[c.evento] ?? '')));
        if (cancel) { canceladas++; continue; }
        const d = String(row[c.dest] ?? '').replace(/\D/g, ''); if (d) dests[d] = (dests[d] || 0) + 1;
        const num = c.num >= 0 ? String(row[c.num] ?? '').replace(/\.0$/, '') : String(+chave.slice(25, 34));
        notas.push({ i: notas.length, tipo, num, valor: valor == null ? null : Math.round(valor * 100) / 100, data, cnpj: String(row[c.cnpj] ?? ''), razao: decodeHtml(row[c.razao]).trim(), fantasia: decodeHtml(c.fant >= 0 ? row[c.fant] : '').trim(), chave });
      }
      if (!notas.length) return null;
      const destino = Object.entries(dests).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      // NFS-e EMITIDAS pela própria empresa (relatório "NFS emitente"): todas com o mesmo CNPJ emitente — são receita, não entram no casamento com pagamentos
      const emits = [...new Set(notas.map(n => String(n.cnpj).replace(/\D/g, '')))];
      const emitente = emits.length === 1 && notas.length > 5 ? emits[0] : '';
      return { notas, canceladas, destino, tipo, emitente };
    }
    return null;
  }

  /**
   * Relatório "Acompanhamento de Serviços" do Domínio (serviços prestados / NFS-e emitidas): uma linha por nota
   * [Código, Data, Nota, Série, Espécie, Cód. cliente, Cliente + AC, UF, Valor contábil, Tipo, Base, Alíq., Valor, Isentas, Outras]; linhas "IRRF" logo abaixo são retenções da nota.
   * Devolve no formato do leitor do SIEG (NFS-e emitidas pela empresa, que é receita), ou null se não for esse relatório.
   */
  function lerAcompanhamentoServicos(lines, Core) {
    const txt = (lines || []).join('\n');
    if (!/ACOMPANHAMENTO DE SERVI[CÇ]OS/i.test(txt)) return null;
    const AMT2 = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
    const reRow = new RegExp('^\\s*(?:1(?=\\s{2,}\\d+\\s+\\d{2}/\\d{2}/\\d{4}))?\\s*(\\d+)\\s+(\\d{2}/\\d{2}/\\d{4})\\s+(.*?)\\s+(\\d{1,3})?\\s*([A-Z]{2})\\s+(' + AMT2 + ')\\s+([A-Z]{2,6})\\s+(' + AMT2 + ')\\s+(' + AMT2 + ')\\s+(' + AMT2 + ')\\s+(' + AMT2 + ')\\s+(' + AMT2 + ')\\s*$');
    const reRet = new RegExp('^\\s*(?:1\\s*)?(IRRF|INSS|PIS|COFINS|CSLL|CSRF|ISS RETIDO)\\s+(' + AMT2 + ')\\s+(' + AMT2 + ')\\s+(' + AMT2 + ')');
    const mh = txt.match(/CNPJ:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    const emitCnpj = mh ? mh[1].replace(/\D/g, '') : '';
    const emitNome = ((lines.find(l => l.trim()) || '').split(/\s{2,}/)[0] || '').trim();
    const notas = []; let cur = null, canceladas = 0;
    for (const l of lines) {
      const m = l.match(reRow);
      if (m) {
        // entre a data e o nome: nota, [série], espécie, código do cliente (números), depois o nome (que pode vir com o acumulador colado: "...S.A926")
        const mid = m[3]; const toks = mid.split(/\s+/); const nums = [];
        while (toks.length && /^\d+$/.test(toks[0]) && nums.length < 4) nums.push(toks.shift());
        let nome = toks.join(' ');
        if (!nome && m[4]) { nome = ''; }
        let nota, serie = '', esp, cli;
        if (nums.length >= 4) [nota, serie, esp, cli] = nums; else if (nums.length === 3) [nota, esp, cli] = nums; else continue;
        // acumulador colado no fim do nome (3 dígitos sem espaço)
        const colado = nome.match(/^(.*?\D)(\d{3})$/); if (colado && !m[4]) nome = colado[1];
        if (/CANCEL/i.test(l)) { canceladas++; cur = null; continue; }
        const bruto = toF(m[6]); const iss = toF(m[10]);
        cur = { i: notas.length, tipo: 'NFSE', modelo: 'NFS-e', num: String(nota).replace(/^0+(?=\d)/, ''), serie, valor: Math.round(bruto * 100) / 100, bruto: Math.round(bruto * 100) / 100, data: m[2], cnpj: emitCnpj, razao: nome.trim().toUpperCase(), fantasia: '',
          codCliente: cli, especie: esp, iss: Math.round(iss * 100) / 100, retencoes: [], avisos: [] };
        notas.push(cur); continue;
      }
      const r = l.match(reRet);
      if (r && cur) { const v = toF(r[4]); cur.retencoes.push({ tipo: r[1], base: toF(r[2]), aliq: toF(r[3]), valor: v }); continue; }
      if (/^\s*1?\s*Total (Cliente|Geral)/i.test(l)) cur = null;
    }
    if (!notas.length) return null;
    // retenções (IRRF etc.): o cliente paga o valor líquido
    for (const n of notas) {
      const ret = n.retencoes.reduce((a, x) => a + x.valor, 0);
      if (ret > 0) { n.valor = Math.round((n.bruto - ret) * 100) / 100; n.avisos.push(`Retenção na fonte de R$ ${Core.fmt(Math.round(ret * 100) / 100)} (${n.retencoes.map(x => x.tipo).join(', ')}): valor líquido a receber R$ ${Core.fmt(n.valor)}.`); }
    }
    const mp = txt.match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+(\d{2}\/\d{2}\/\d{4})/i);
    // confere com o "Total Geral" do relatório
    const mg = txt.match(/Total Geral\s*\n?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    const soma = Math.round(notas.reduce((a, n) => a + n.bruto, 0) * 100) / 100;
    const avisos = [];
    if (mg && Math.abs(toF(mg[1]) - soma) > 0.015) avisos.push(`A soma das notas lidas (R$ ${Core.fmt(soma)}) não bate com o Total Geral do relatório (R$ ${mg[1]}).`);
    return { notas, canceladas, destino: '', tipo: 'NFSE', emitente: emitCnpj, relatorio: 'servicos', empresa: emitNome, periodo: mp ? [mp[1], mp[2]] : null, totalRelatorio: mg ? toF(mg[1]) : null, soma, avisos };
  }

  /**
   * XML de CT-e (modelo 57 ou CT-e OS 67) ou de NF-e/NFC-e (55/65), do Cofre SIEG ou da SEFAZ -> nota no formato do leitor do SIEG.
   * O relatório Excel do SIEG não traz o valor do CT-e; o XML traz: valor da prestação (vTPrest) e o TOMADOR, quem paga o frete
   * (toma3 aponta remetente/expedidor/recebedor/destinatário; toma4 e o <toma> do CT-e OS trazem o documento). Devolve null se não for documento fiscal.
   */
  function lerXmlFiscal(txt, Core) {
    if (typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(String(txt || '').replace(/^﻿/, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    const tag = (el, n) => (el && el.getElementsByTagNameNS('*', n)[0]) || null;
    const txtDe = (el, ...cam) => { let e = el; for (const n of cam) { e = tag(e, n); if (!e) return ''; } return (e.textContent || '').trim(); };
    const docDe = el => el ? (txtDe(el, 'CNPJ') || txtDe(el, 'CPF')).replace(/\D/g, '') : '';
    const num = s => { const v = parseFloat(s); return isFinite(v) ? Math.round(v * 100) / 100 : null; };
    const cancelada = st => !!st && !/^(100|150)$/.test(st);
    const cte = tag(doc, 'infCte');
    if (cte) {
      const ide = tag(cte, 'ide');
      const chave = (cte.getAttribute('Id') || '').replace(/\D/g, '') || txtDe(doc, 'chCTe').replace(/\D/g, '');
      let toma = '';
      const t4 = tag(ide, 'toma4'), t3 = tag(ide, 'toma3');
      if (t4) toma = docDe(t4);
      else if (t3) { const p = { '0': 'rem', '1': 'exped', '2': 'receb', '3': 'dest' }[txtDe(t3, 'toma')]; toma = p ? docDe(tag(cte, p)) : ''; }
      else { const t = tag(cte, 'toma'); if (t && t.children.length) toma = docDe(t); }
      const emit = tag(cte, 'emit');
      return { tipo: 'CTE', modelo: txtDe(ide, 'mod'), num: String(+txtDe(ide, 'nCT') || ''), valor: num(txtDe(cte, 'vPrest', 'vTPrest')), vrec: num(txtDe(cte, 'vPrest', 'vRec')),
        data: Core.parseData(txtDe(ide, 'dhEmi')) || '', cnpj: docDe(emit), razao: txtDe(emit, 'xNome').toUpperCase(), fantasia: txtDe(emit, 'xFant').toUpperCase(),
        chave, toma, rem: docDe(tag(cte, 'rem')), dest: docDe(tag(cte, 'dest')), cancelada: cancelada(txtDe(doc, 'infProt', 'cStat')) };
    }
    const nfe = tag(doc, 'infNFe');
    if (nfe) {
      const ide = tag(nfe, 'ide'), emit = tag(nfe, 'emit');
      const parcelas = [...nfe.getElementsByTagNameNS('*', 'dup')].map(d => ({ parc: txtDe(d, 'nDup'), venc: Core.parseData(txtDe(d, 'dVenc')) || '', valor: num(txtDe(d, 'vDup')) }));
      return { tipo: txtDe(ide, 'mod') === '65' ? 'NFCE' : 'NFE', modelo: txtDe(ide, 'mod'), num: String(+txtDe(ide, 'nNF') || ''), serie: txtDe(ide, 'serie'),
        valor: num(txtDe(nfe, 'total', 'ICMSTot', 'vNF')), data: Core.parseData(txtDe(ide, 'dhEmi') || txtDe(ide, 'dEmi')) || '', cnpj: docDe(emit),
        razao: txtDe(emit, 'xNome').toUpperCase(), fantasia: txtDe(emit, 'xFant').toUpperCase(), destino: docDe(tag(nfe, 'dest')),
        chave: (nfe.getAttribute('Id') || '').replace(/\D/g, ''), parcelas, cancelada: cancelada(txtDe(doc, 'infProt', 'cStat')) };
    }
    return null;
  }

  /* ---------- classificação por regras (sem IA) ---------- */
  const R = [
    // [regex no histórico/complemento/categoria do cliente, regex do nome da conta no plano, confiança, motivo]
    [/IOF/, [/^IOF\b/, /\bIOF\b/], 'A'], [/TARIFA|PACOTE (DE )?SERV|CESTA|MANUT(ENCAO)? (DE )?CONTA|TAXA BANC|COBRANCA BANC|TAR\.|DB T CESTA|DEB(ITO)? CESTA|TARIFA PIX/, /TARIFA|DESPESAS? BANC|JUROS E COMISS|TAXAS? BANC|DESPESAS FINANC/, 'A'],
    [/JUROS|ENCARGOS? (DE )?(CHEQUE|LIMITE|CONTA)|CHEQUE ESPECIAL|MORA/, [/^JUROS PASSIVOS/, /^JUROS DE MORA/, /^JUROS E COMISS/, /ENCARGOS FINANC/, /DESPESAS FINANC/], 'M'],
    [/REND CDB|RENDIMENTO/, /RENDIMENTO|RECEITAS? FINANC|JUROS ATIVOS|APLICA[CÇ]/, 'A'],
    [/RDC|RESG|APLIC|RENDE F|CDB/, /APLICA[CÇ][AÃ]O|RENDA FIXA|INVESTIMENT|RDC/, 'A'],
    [/PEDAGIO|SEM PARAR|CONECTCAR|SICOOB TAG|VELOE|ESTACIONAMENTO/, /PEDAGI|ESTACIONAM|VEICUL|FRETES|VIAGENS|TRANSPORT/, 'M'],
    [/COMBUSTIV(EL|EIS)|POSTO|GASOLINA|DIESEL|ETANOL|ABASTECE?DORA|ABASTECIMENTO|IPIRANGA|SHELL|PETROBRAS|DERIVADOS DE PETROLEO/, /COMBUST|LUBRIFIC/, 'M'],
    [/ENERGIA|CELESC|CEEE|RGE\b|CPFL|CEMIG|ENEL|LUZ\b|COPEL|EQUATORIAL/, /ENERGIA|LUZ\b/, 'M'],
    [/AGUA|CORSAN|SANEPAR|SABESP|SAMAE|CASAN|COPASA|EMBASA/, /\bAGUA\b|SANEAMENTO/, 'M'],
    [/TELEFON|TELECOMUNICA|VIVO|CLARO|INTERNET|BANDA LARGA/, /TELEFON|INTERNET|COMUNICA/, 'M'],
    [/ALUGUEL|LOCACAO/, /ALUGU|LOCA[CÇ][AÃ]O/, 'M'],
    [/SALARIO|CONTRACHEQUE|HOLERITE|FOLHA|PAGAMENTO DE SALARIO|PGTO SALARIO|ADIANTAMENTO SALARIAL|13[ºO°]?\s?SAL|FERIAS|RESCIS/, /SAL[AÁ]RIOS|ORDENADOS|REMUNERA|FOLHA/, 'M'],
    [/\bGPS\b|INSS|PREVIDENCIA/, /INSS|PREVID/, 'M'], [/FGTS|\bGRF\b/, /FGTS/, 'M'],
    [/SIMPLES|\bDAS\b|DARF/, /SIMPLES|IMPOSTOS|TRIBUT|\bDAS\b|\bDARF\b/, 'M'],
    [/IPVA|LICENCIAMENTO/, /IPVA|LICENCIAMENTO/, 'M'], [/IPTU/, /IPTU/, 'M'], [/ALVARA/, /ALVAR[AÁ]/, 'M'], [/IRPJ/, /IRPJ/, 'M'], [/CSLL/, /CSLL/, 'M'], [/\bPIS\b/, /\bPIS\b/, 'M'], [/COFINS/, /COFINS/, 'M'], [/\bISS(QN)?\b/, /\bISS/, 'M'],
    [/SEGURO/, /SEGUROS?/, 'M'], [/HONORARIO|CONTABIL|CONTABILIDADE/, /HONOR[AÁ]RIOS|CONT[AÁ]BIL/, 'M'],
    [/AUTO ?PECAS?|PNEUS?|BATERIAS|MECANICA|AUTOMOTIV|OFICINA|FUNILARIA|RETIFICA/, [/MANUTEN[CÇ][AÃ]O (DE|DO|DOS) VE[IÍ]CULOS?/, /MANUTEN[CÇ][AÃ]O/], 'M'],
    [/INFORMATICA|PAPELARIA|ESCRITORIO|TONER|CARTUCHO/, [/MATERIAL DE ESCRIT/], 'M'],
    [/SUPERMERCADO|ATACAD|PADARIA|RESTAURANTE|LANCHONETE|ALIMENT|HORTIFRUTI|FRIGORIFICO/, [/ALIMENTA/], 'M'],
    [/MATERIAIS? (DE |PARA )?(CONSTRUCAO|OBRA|ELETRIC)|CONSTRUCAO|CONSTRUCOES|FERRAGENS?|FERRAMENTAS?|ELETRICA|ELETRICO|ELETROLAR|HIDRAULIC|TINTAS?|MADEIREIRA|VIDRO|VIDRACARIA|METALURG|PARAFUSOS|ALUMINIO|ISOLANTES|ILUMINACAO|CABOS|SERRALHERIA|REVESTIMENTO|PISOS?|CIMENTO|DISTRIB\w* DE MAT|MATERIAIS|PLASTICOS?|CHAPAS?|MOVEIS|MARMORARIA|ACABAMENTO|ARGAMASSA/, [/MATERIAIS? PARA (A )?PRESTA/, /MATERIAIS? (APLICAD|DE OBRA|DE CONSTRU)/, /MATERIAL (PARA )?USO E CONSUMO/, /MATERIA/], 'M'],
    [/EMPRESTIMO|DEB\.?\s?EMPR|FINANCIAMENTO/, /EMPR[EÉ]STIMO|FINANCIAMENTO/, 'M'],
    [/MARKETING|PROPAGANDA|PUBLICIDADE|ANUNCIO|GOOGLE ADS|FACEBOOK|META ADS|INSTAGRAM/, /PUBLICIDADE|PROPAGANDA|MARKETING/, 'M'],
    [/\bEPI\b|UNIFORME/, /EPI|UNIFORME/, 'M'], [/SEGURANCA|VIGILANCIA|ALARME/, /SEGURAN[CÇ]A|VIGIL/, 'M'], [/LIMPEZA|HIGIENE/, /LIMPEZA/, 'M'],
    [/PLANO DE SAUDE|UNIMED|UNIODONTO|CONVENIO MEDICO/, /SA[UÚ]DE|CONV[EÊ]NIO|ASSIST/, 'M'], [/VALE ALIMENT|IFOOD ?BENEF|ALELO|TICKET|SODEXO/, /ALIMENTA|VALE|BENEF[IÍ]CIO/, 'M']
  ];
  for (const x of R) x[0] = new RegExp('(?<![A-Z0-9])(?:' + x[0].source + ')');
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'por', 'com', 'ltda', 'me', 'epp', 'sa', 'ref', 'referente', 'pagto', 'pgto', 'pagamento', 'nf']);
  const toks = s => nrm(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(t => t.length > 2 && !stop.has(t));
  /** Prepara o plano do cliente: contas analíticas de despesa/receita/etc. com tokens e índice por nome. */
  function prepararPlano(contas, Core) {
    const ana = contas.filter(c => Core.isAnalitica(c) && !/^2\.1\.3\.01\.|^1\.1\.2\.01\./.test(c[1]));
    const pl = ana.map(c => ({ c, nome: nrm(c[2]), up: nrm(c[2]).toUpperCase(), toks: new Set(toks(c[2])) }));
    // contas de fornecedores (passivo 2.1.3.01.): não entram nas regras de natureza, só no casamento com a razão social da NF-e
    pl.forn = contas.filter(c => Core.isAnalitica(c) && /^2\.1\.3\.01\./.test(c[1])).map(c => ({ c, nome: nrm(c[2]), toks: new Set(toks(c[2])) }));
    pl.todas = contas.filter(c => Core.isAnalitica(c) && !/^1\.1\.1\.|APROPRIAR|PROVIS|^\(-\)|DEPRECIA|AMORTIZ/.test(nrm(c[2]).toUpperCase()) && !/^1\.1\.1\./.test(c[1])).map(c => ({ c, nome: nrm(c[2]), toks: new Set(toks(c[2])) }));
    pl.cli = contas.filter(c => Core.isAnalitica(c) && /^1\.1\.2\.01\./.test(c[1])).map(c => ({ c, nome: nrm(c[2]), toks: new Set(toks(c[2])) }));
    pl.contas = contas; // plano inteiro: usado para achar a conta pelo CPF/CNPJ/contrato que o extrato mostra
    return pl;
  }
  /** Conta do fornecedor no plano cuja razão social bate com a do emitente da NF-e (todas as palavras distintivas). */
  function contaFornecedor(plano, nome) {
    const alvo = new Set(toks(nome).filter(x => !/^(ltda|eireli|epp|ind|com|comercio|industria|servicos|sa)$/.test(x)));
    if (!alvo.size || !plano.forn || !plano.forn.length) return null;
    let melhor = null, ms = 0, empate = false;
    for (const p of plano.forn) {
      const pt = [...p.toks].filter(x => !/^(ltda|eireli|epp|ind|com|comercio|industria|servicos|sa)$/.test(x));
      if (!pt.length) continue;
      const inter = pt.filter(x => alvo.has(x)).length;
      const sc = inter / Math.max(pt.length, alvo.size);
      if (sc > ms + 1e-9) { ms = sc; melhor = p; empate = false; } else if (Math.abs(sc - ms) < 1e-9 && sc > 0) empate = true;
    }
    return melhor && ms >= 0.75 && !empate ? melhor : null;
  }
  const GEN_FORN = /^(ltda|eireli|epp|ind|com|comercio|comercial|industria|servicos|sa|me|distribuidora|materiais|produtos|empresa)$/;
  /** Procura, numa lista de contas, a que tem o nome do fornecedor/conta escrito pelo cliente (tolera nome cortado: "COMERCI" = "COMERCIAL"). */
  const FRACA = /^(imp|exp|importacao|exportacao|acess|acessorios|pecas|autopecas|auto|alimentos|bebidas|transportes?|servico|materiais|construcao|moveis|equipamentos|distribuidora|atacado|varejo|representacoes|participacoes|empreendimentos|agro|agropecuaria|metalurgica|grafica|farmacia|supermercado|posto|combustiveis|industr|comerci|comercio|comercial|industria|produtos|informacao|informatica|contabilidade|contabil|assessoria|consultoria|tecnologia|sistemas|engenharia|construtora|monitoramento|vigilancia|seguranca|limpeza|conservacao|telecom|telecomunicacoes|energia|saneamento|educacao|escola|clinica|laboratorio|odontologia|ensino|treinamentos|eventos|publicidade|marketing|locacao|locadora|transportadora|logistica)$/;
  const LUGAR = /^(matriz|filial|sede|unidade|loja|centro|central|norte|sul|leste|oeste|geral|nacional|regional|brasil|brasileira|grupo|holding|franquia|posto|deposito|galpao|depto|departamento|setor)$/;
  const FRACA2 = { test: x => FRACA.test(x) || LUGAR.test(x) };
  const RUIDO = /^(pix|qr|code|recebido|recebimento|receb|pago|pagto|pgto|pagamento|boleto|doc|nf|nfe|nfce|nfse|tit|ted|transf|transferencia|compra|venda|ref|referente|parcela|parc|valor|dinheiro|cartao|debito|credito)$/;
  const toks2 = s => nrm(s).replace(/(\d+)/g, ' $1 ').replace(/[^a-z ]/g, ' ').split(' ').filter(t => t.length >= 2 && !stop.has(t));
  function acharPorNome(lista, texto, estrito = false, permissivo = false, natureza = false) {
    const tt = toks2(texto).filter(x => !RUIDO.test(x));
    if (!tt.length) return null;
    const bate = estrito ? (w => tt.includes(w)) : (w => tt.some(x => x === w || (x.length >= 4 && w.startsWith(x)) || (GEN_FORN.test(w) && w.length >= 4 && x.startsWith(w)) || (w.length >= 4 && x === w + 's')));
    const res = [];
    for (const p of lista) {
      const todos = p.toks2 || (p.toks2 = toks2(p.c[2])), pt = todos.filter(x => !GEN_FORN.test(x));
      const marcaOk = pt.length && ((bate(pt[0]) && !FRACA2.test(pt[0])) || pt.some(w => w.length >= 5 && !FRACA2.test(w) && tt.includes(w)));
      if (!marcaOk) continue;
      const dist = pt.filter(x => x.length > 2 && !FRACA2.test(x));
      if (!natureza && dist.length >= 2 && dist.filter(bate).length < 2) {
        // exceção: empresa (LTDA/SA/EIRELI) cuja marca, com 6+ letras, aparece escrita por inteiro e só nessa conta da lista
        const m1 = dist.filter(w => w.length >= 6 && !FRACA2.test(w) && tt.includes(w) && lista.filter(q => (q.toks2 || (q.toks2 = toks2(q.c[2]))).includes(w)).length === 1)[0];
        if (!(m1 && /\b(ltda|eireli|epp|s a|sa)\b/.test(nrm(p.c[2]).replace(/[^a-z ]/g, ' ')) && !/\bme\b/.test(nrm(p.c[2]).replace(/[^a-z ]/g, ' ')))) continue;
      } // uma só palavra em comum (sobrenome ou marca, ex.: SILVA, BOSCO) não identifica: exige ao menos 2 palavras do nome da conta
      const hit = pt.filter(bate).length, gen = todos.filter(x => GEN_FORN.test(x) && bate(x)).length; // gen: "INDUSTR" = INDUSTRIA também conta como indício
      res.push({ p, hit, gen, evid: hit + gen, n: pt.length, sc: hit / pt.length, marca: bate(pt[0]) ? pt[0] : (pt.find(w => w.length >= 5 && tt.includes(w))) });
    }
    if (!res.length) return null;
    res.sort((a, b) => (b.evid - a.evid) || (b.sc - a.sc));
    const a1 = res[0], a2 = res[1];
    const empate = a2 && a2.evid === a1.evid && Math.abs(a2.sc - a1.sc) < 1e-9;
    const unico = !a2 || a1.evid > a2.evid;
    const longa = a1.marca.length >= 6;
    const forte = unico && (a1.evid >= 2 || longa || (a1.n === 1 && a1.marca.length >= 4)) && (a1.sc >= 0.5 || a1.evid >= 2 || longa);
    if (estrito) return a1.sc >= 0.999 && a1.n >= 2 && unico ? { p: a1.p, sc: a1.sc, forte: true, unico } : null;
    if (permissivo && unico && a1.marca && a1.marca.length >= 5) return { p: a1.p, sc: a1.sc, forte: true, unico: true };
    if (!forte && a1.sc < 0.5 && a1.evid < 2 && !longa) return null;
    return { p: a1.p, sc: a1.sc, forte, unico: unico && !empate };
  }
  const contraBanco = /^1\.1\.1\.0[1-3]\./;
  /**
   * Classifica um lançamento só com regras. t: {historico, complemento, tipo, valor, cli?}
   * Devolve {c, n, m, p} ou {c:null, n:'B', r:...}.
   */
  function classificar(t, plano, Core) {
    const hist = nrm(t.historico), comp = nrm(t.complemento);
    const cat = t.cli ? nrm([t.cli.categoria, t.cli.descricao, t.cli.complemento].filter(Boolean).join(' ')) : '';
    const forn = t.nf ? nrm(t.nf.forn) : '';
    const txt = (cat + ' ' + hist + ' ' + comp + ' ' + forn).toUpperCase();
    const despesa = t.tipo === 'D';
    const cands = plano.filter(p => despesa ? !/^1\./.test(p.c[1]) || /^1\.1\.2|^1\.2/.test(p.c[1]) : true);
    // 00) o EXTRATO identifica a contraparte: CPF/CNPJ (ou nº do contrato) igual ao que está escrito na conta do plano — vence qualquer semelhança de nome
    {
      const txtDoc = String(t.historico || '') + ' ' + String(t.complemento || '');
      let pd = Core.contaPorDocumento(plano.contas || [], txtDoc), ponte = '';
      if (!pd && plano.vinculos) {
        // ponte do SIEG: o CPF do extrato aparece no nome do emitente das NFS-e ("AMANDA MACHADO CHAVES 87239809072", CNPJ 40.525.433/0001-85)
        const cpfs = (txtDoc.match(/\d{3}\.\d{3}\.\d{3}-\d{2}|\b\d{11}\b/g) || []).map(x => x.replace(/\D/g, ''));
        for (const cpf of cpfs) { const cn = plano.vinculos.get(cpf); if (cn) { pd = Core.contaPorDocumento(plano.contas || [], cn); if (pd) { ponte = ` (o CPF ${cpf} do extrato está no nome do emitente das NFS-e do SIEG, CNPJ ${cn})`; break; } } }
      }
      if (pd) return { c: pd[0], n: 'A', m: /\bC\d{8,}\b/.test(txtDoc) && /C\d{8,}/.test(pd[2]) ? 'Nº do contrato no extrato = conta do plano.' : `CPF/CNPJ do extrato = documento que consta na conta do plano${ponte}.`, p: null };
    }
    // 0) a nota do SIEG casa com o extrato e o fornecedor existe no plano: classifica na conta do fornecedor
    if (t.nf && !t.nf.tit && despesa && (plano.forn || []).length) {
      const pf = contaFornecedor(plano, t.nf.forn);
      if (pf) return { c: pf.c[0], n: t.nf.soForn && !t.nf.porDoc ? 'M' : 'A', m: t.nf.soForn ? (t.nf.porDoc ? 'CNPJ do extrato = emitente das notas do SIEG = conta do fornecedor no plano (nenhuma nota com este valor).' : 'Conta do fornecedor no plano (identificado pelo extrato, sem NF).') : `Conta do fornecedor no plano; NF-e ${t.nf.num} do SIEG fecha com o extrato.`, p: null };
    }
    // 0') transportadora com CT-e no SIEG (CNPJ do extrato, ou CT-e do XML que fecha com o valor) e sem conta própria no plano: frete
    if (t.nf && t.nf.cte && despesa) {
      const fr = plano.find(p => /FRETE/.test(p.up));
      if (fr) return { c: fr.c[0], n: 'A', m: t.nf.soForn ? `Transportadora ${t.nf.forn} identificada pelo CNPJ com CT-e no SIEG.` : `Frete: CT-e ${t.nf.num} de ${t.nf.forn} (lido do XML) fecha com o extrato.`, p: null };
    }
    // 0a) parcela do contas a pagar/receber do cliente (nome do fornecedor/cliente vem do relatório do sistema dele)
    if (t.nf && t.nf.tit) {
      const lista = despesa ? (plano.forn || []) : (plano.cli || []);
      if (lista.length) {
        const pc = (despesa ? contaFornecedor(plano, t.nf.forn) : contaFornecedor({ forn: lista }, t.nf.forn)) || (() => { const x = acharPorNome(lista, t.nf.forn); return x && x.forte && x.unico ? x.p : null; })();
        if (pc) return { c: pc.c[0], n: t.nf.conf === 'A' ? 'A' : 'M', m: `Conta ${despesa ? 'do fornecedor' : 'do cliente'} no plano; ${t.nf.obs}`, p: null };
      }
    }
    // 0b) o cliente escreveu o nome do fornecedor (ou da conta) e ele existe no plano
    if (t.cli && despesa) {
      const txtCli = [t.cli.categoria, t.cli.descricao, t.cli.complemento].filter(Boolean).join(' ');
      const exatoCat = t.cli.categoria && plano.find(p => p.nome === nrm(t.cli.categoria));
      if (exatoCat) return { c: exatoCat.c[0], n: 'A', m: 'Conta do plano com o mesmo nome da categoria informada pelo cliente.', p: null };
      const temNF = !!t.nf || /\bNFC?-?E?\b|NF\s*N|NOTA FISCAL|\bNFS?E?\b/.test(nrm(txtCli).toUpperCase()) || !!t.cli.documento;
      const pf = acharPorNome(plano.forn || [], txtCli, false, temNF);
      if (pf && pf.forte) return { c: pf.p.c[0], n: 'A', m: 'Conta do fornecedor no plano, com o nome informado pelo cliente na planilha.', p: null };
      const nat = plano.filter(p => !/^1\./.test(p.c[1]) && !/APROPRIAR|PROVIS|^\(-\)|CREDITO|RECUPERAR|DEPRECIA|AMORTIZ|PARCELAMENTO|ADIANTAMENTO/.test(p.up));
      const pc = acharPorNome(nat, [t.cli.categoria, t.cli.descricao].filter(Boolean).join(' '), false, false, true);
      if (pc && pc.forte && pc.sc >= 0.999) return { c: pc.p.c[0], n: 'A', m: 'Conta do plano com o nome informado pelo cliente na planilha.', p: null };
      if (pf && temNF && pf.unico) return { c: pf.p.c[0], n: 'A', m: 'Fornecedor com conta no plano e nota fiscal informada pelo cliente.', p: null };
      if (pf && (pf.sc >= 0.5 || pf.unico)) return { c: pf.p.c[0], n: 'M', m: 'Conta de fornecedor parecida com o nome informado pelo cliente — confira.', p: null };
    }
    // 0c) entrada: o cliente (comprador) tem conta no plano e o nome aparece na planilha do cliente
    if (!despesa && (plano.cli || []).length) {
      const txtCli = t.cli ? [t.cli.categoria, t.cli.descricao, t.cli.complemento].filter(Boolean).join(' ') : '';
      const temNFc = /\bNFC?-?E?\b|NF\s*N|NOTA FISCAL|NFCE/.test(nrm(txtCli).toUpperCase());
      const pc = txtCli && acharPorNome(plano.cli, txtCli, false, temNFc);
      if (pc && pc.forte) return { c: pc.p.c[0], n: 'A', m: 'Conta do cliente (comprador) no plano, com o nome informado na planilha.', p: null };
      if (pc && pc.unico && /\bNFC?-?E?\b|NF\s*N|NOTA FISCAL|NFCE/.test(nrm(txtCli).toUpperCase())) return { c: pc.p.c[0], n: 'A', m: 'Cliente com conta no plano e nota fiscal informada pelo cliente.', p: null };
      const pe = acharPorNome(plano.cli, String(t.complemento || '').replace(/\d[\d.\/-]*/g, ' '));
      if (pe && pe.forte) return { c: pe.p.c[0], n: 'M', m: 'Conta de cliente no plano, pelo nome no extrato — confira.', p: null };
    }
    // 0d) o cliente escreveu um nome e informou a nota fiscal: procura em TODAS as contas do plano (qualquer grupo)
    let procurado = '';
    if (t.cli) {
      const txtCli = [t.cli.categoria, t.cli.descricao, t.cli.complemento].filter(Boolean).join(' ');
      const temNF = /\bNFC?-?E?\b|NF\s*N|NOTA FISCAL|NFCE|\bNFS?E?\b/.test(nrm(txtCli).toUpperCase()) || !!t.cli.documento || !!t.nf;
      procurado = toks2(txtCli).filter(x => !RUIDO.test(x)).join(' ');
      if (temNF && (plano.todas || []).length) {
        const pt = acharPorNome(plano.todas, txtCli, false, true);
        if (pt && pt.forte && pt.unico) return { c: pt.p.c[0], n: 'A', m: 'Conta do plano com o nome informado pelo cliente e nota fiscal informada.', p: null };
      }
    }
    // 0e) o NOME do fornecedor/cliente aparece na descrição do próprio extrato (boleto, PIX, TED) e existe conta dele no plano
    let dicaNome = '';
    {
      let txtExt = String(t.historico || '') + ' ' + String(t.complemento || '');
      // só vale o favorecido/remetente: o texto depois do primeiro CPF/CNPJ costuma ser o nome do próprio titular da conta
      const corte = txtExt.search(/[\d*]{2,3}\.[\d*]{3}\.[\d*]{3}[-\/ ]|\d{3}\.\d{3}\.\d{3}-|\b\d{11,14}\b/);
      if (corte > 0) txtExt = txtExt.slice(0, corte);
      const lista = despesa ? (plano.forn || []) : (plano.cli || []);
      if (lista.length && /[A-Za-z]{4}/.test(txtExt) && !/CONTRACHEQUE|HOLERITE|SALARIO|FOLHA|FERIAS|RESCIS|13[ºO°]?\s?SAL/.test(txt)) {
        const px = acharPorNome(lista, txtExt.replace(/\d[\d.\/-]*/g, ' '), false, true);
        // o nome do extrato tem de ser o COMEÇO do nome da conta (2+ palavras na mesma ordem; a última pode estar cortada pelo banco).
        // Uma palavra em comum ("SIMONETTI TINTAS" x "RAFAEL SIMONETTI IMPERATORI") é coincidência: não classifica, só avisa.
        const VAZIAS = /^(PAGAMENTO|RECEBIMENTO|PIX|DEB|CRED|LIQUIDACAO|BOLETO|SICREDI|DEBITO|CREDITO|CONVENIOS|COMPRAS|NACIONAIS|TED|DOC|TRANSF|TRANSFERENCIA|ENVIADO|RECEBIDO|DE|DA|DO|DOS|DAS|E)$/;
        const pals = s => nrm(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(w => w && !/^\d+$/.test(w));
        const inicio = c => {
          const a = pals(txtExt).filter(w => !VAZIAS.test(w)), b = pals(c[2]).filter(w => !VAZIAS.test(w));
          if (a.length < 2) return false;
          const n = Math.min(a.length, b.length, 4);
          return n >= 2 && a.slice(0, n).every((w, i) => w === b[i] || (i === n - 1 && b[i].startsWith(w)));
        };
        if (px && px.forte && px.unico && !inicio(px.p.c)) { dicaNome = ` O nome do extrato lembra a conta "${px.p.c[2]} (${px.p.c[0]})", mas só por uma palavra — confira antes de usar.`; }
        else if (px && px.forte && px.unico) {
          const temNFx = !!t.nf || !!(t.cli && (t.cli.documento || /\bNFC?-?E?\b|NF\s*N|NOTA FISCAL|\bNFS?E?\b/.test(nrm([t.cli.categoria, t.cli.descricao, t.cli.complemento].filter(Boolean).join(' ')).toUpperCase())));
          const ehBoleto = /BOLETO|TITULO|TIT\b|COBRANCA/.test(txtExt.toUpperCase());
          // só o nome não basta para Alta: se a conta do plano traz CPF/CNPJ e o extrato mostra outro documento, ou se é pessoa física, fica Média
          const docPlano = (px.p.c[2].match(/\d[\d.\-\/]{6,}\d/) || [''])[0];
          const docExt = (String(t.complemento || '').match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/) || [''])[0];
          const pj = /\b(LTDA|EIRELI|EPP|S\/?A|ME)\b/i.test(px.p.c[2]) || /\/\d{4}-\d{2}/.test(docExt); // CNPJ no extrato = empresa
          if (docPlano && docExt) return { c: px.p.c[0], n: 'M', m: `Nome igual ao da conta do plano, mas o documento do extrato (${docExt}) não é o da conta (${docPlano}). Confira.`, p: null };
          if (!pj) return { c: px.p.c[0], n: 'M', m: 'Pessoa física identificada só pelo nome completo no extrato (sem CPF na conta do plano). Confira.', p: null };
          return { c: px.p.c[0], n: (temNFx || ehBoleto) ? 'A' : 'M', m: 'Conta do ' + (despesa ? 'fornecedor' : 'cliente') + ' no plano, pelo nome completo da empresa que consta no extrato do banco.' + ((temNFx || ehBoleto) ? '' : ' Confira.'), p: null };
        }
      }
    }
    // 1) a categoria do cliente: nome idêntico ou muito parecido com uma conta
    if (t.cli && (t.cli.categoria || t.cli.descricao)) {
      const alvo = toks([t.cli.categoria, t.cli.descricao].filter(Boolean).join(' '));
      if (alvo.length) {
        let melhor = null, ms = 0;
        for (const p of plano) {
          if (!p.toks.size) continue;
          const inter = alvo.filter(x => p.toks.has(x)).length;
          const sc = inter / Math.max(p.toks.size, 1) * 0.6 + inter / Math.max(alvo.length, 1) * 0.4;
          if (inter && sc > ms) { ms = sc; melhor = p; }
        }
        const exato = t.cli.categoria && plano.find(p => p.nome === nrm(t.cli.categoria));
        if (exato) return { c: exato.c[0], n: 'M', m: 'Conta igual à categoria informada pelo cliente.', p: null };
        if (melhor && ms >= 0.55) return { c: melhor.c[0], n: 'M', m: 'Conta parecida com a categoria/descrição do cliente — confira.', p: null };
      }
    }
    // 2) palavras-chave por natureza
    for (const [re, nomeRe, conf] of R) {
      if (!re.test(txt)) continue;
      const lista = Array.isArray(nomeRe) ? nomeRe : [nomeRe];
      const amplo = /APLICA|EMPR|FINANCIAMENTO/.test(lista[0].source);
      const pool = (amplo ? plano : cands.filter(p => !/^1\./.test(p.c[1]))).filter(p => !/^(CR[EÉ]DITOS?\b|PROVIS|\(-\)|DEPRECIA|AMORTIZA|JUROS A APROPRIAR|JUROS SOBRE (O )?CAPITAL)/.test(p.up));
      const banco = t.bn ? nrm(t.bn).toUpperCase().split(' ')[0] : '';
      const porBanco = amplo && banco ? pool.filter(p => p.up.includes(banco)) : [];
      let hit = null; for (const rx of lista) { hit = porBanco.find(p => rx.test(p.up)) || pool.find(p => rx.test(p.up)); if (hit) break; }
      if (hit) return { c: hit.c[0], n: conf, m: conf === 'A' ? '' : 'Classificado por palavra-chave do histórico; confira.', p: null };
    }
    // 3) nada serviu
    const nat = t.tipo === 'C' ? 'Entrada sem natureza identificada' : 'Saída sem natureza identificada';
    return { c: null, n: 'B', r: nat, m: (procurado ? `Procurei "${procurado.toUpperCase().slice(0, 40)}" nas contas do plano e não achei uma conta única. Classifique manualmente.` : 'Nenhuma regra serviu. Classifique manualmente.') + dicaNome, p: null };
  }


  /** Contas do plano mais prováveis para um lote de lançamentos (para caber no limite de IAs gratuitas). */
  function shortlist(plano, itens, max = 120) {
    const texto = itens.map(t => [t.historico, t.complemento, t.nf && t.nf.forn, t.cli && t.cli.categoria, t.cli && t.cli.descricao].filter(Boolean).join(' ')).join(' ');
    const tk = new Set(toks(texto));
    const ponto = p => [...p.toks].filter(x => tk.has(x)).length;
    const fixas = new Set();
    for (const [, nomeRe] of R) for (const rx of (Array.isArray(nomeRe) ? nomeRe : [nomeRe])) for (const p of plano) if (rx.test(p.up) && !/^CR[EÉ]DITOS?\b/.test(p.up)) fixas.add(p);
    const fx = [...fixas].sort((a, b) => ponto(b) - ponto(a)).slice(0, 70);
    const rec = itens.some(t => t.tipo === 'C') ? plano.filter(p => /RECEITA|VENDA|SERVI[CÇ]OS PRESTADOS|FATURAMENTO|CLIENTES|APORTE|EMPR[EÉ]STIMO/.test(p.up)).slice(0, 25) : [];
    const resto = plano.filter(p => !fixas.has(p) && ponto(p) > 0).sort((a, b) => ponto(b) - ponto(a));
    const out = []; const vistos = new Set();
    for (const p of [...fx, ...rec, ...resto]) { if (vistos.has(p.c[0])) continue; vistos.add(p.c[0]); out.push(p); if (out.length >= max) break; }
    return out;
  }

  return { shortlist, planilhaDeCelulas, relatorioPdf, lerTitulos, lerSieg, lerAcompanhamentoServicos, lerXmlFiscal, lerNotaFiscal, csvRows, lerExtrato, cresol, detectarPlanilha, vendasPorPedido, prepararPlano, classificar, acharBanco, acharPorNome, sicoob, caixa, banrisul, itau, nubank, pagbankVendas, sicredi, bb, santanderPdf, mercadoPago, caixaNovo, bradescoInvest, bradescoCC, versapay, porLayout, assinatura, porModelo, inferirModelo, textoGenerico, tabular };
})();

module.exports = { Core, Local };
