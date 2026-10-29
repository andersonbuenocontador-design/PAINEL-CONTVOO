import ExcelJS from 'exceljs';

export type Movimento = {
  data: string;            // YYYY-MM-DD
  descricao: string;       // descrição ORIGINAL do banco, sem alteração
  valor: number;           // centavos; entrada > 0, saída < 0
  saldo: number | null;    // centavos, quando existir
  idExterno: string | null; // FITID / identificador de transação
  documento: string | null;
};
export type Extrato = {
  formato: 'ofx' | 'csv' | 'xlsx' | 'pdf';
  movimentos: Movimento[];
  erros: { linha: number; motivo: string }[];
  conta?: { banco?: string; agencia?: string; conta?: string };
  saldoFinalInformado?: number | null;
  /** Só quando o arquivo traz saldo anterior e final (hoje, leitor de PDF). confere=null => dados insuficientes para afirmar. */
  conferenciaSaldo?: { saldoAnterior: number | null; saldoFinalInformado: number | null; saldoCalculado: number | null; confere: boolean | null; diferenca: number | null };
};
export class ExtratoIlegivel extends Error {}

const sem = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** "1.500,00" | "1500,00" | "1500.00" | "(450,00)" | "R$ -450,00" | "450,00 D" → centavos */
export function paraCentavos(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  let s = String(v ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/(\s|^)d$/i.test(s) || /-$/.test(s)) neg = true;
  s = s.replace(/r\$/i, '').replace(/\s*[cd]$/i, '').replace(/-$/, '').replace(/\s/g, '');
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const ult = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let inteiro = s, frac = '';
  if (ult >= 0) {
    const depois = s.slice(ult + 1);
    const outro = s.includes(',') && s.includes('.');
    const soUm = (s.match(/[.,]/g) ?? []).length === 1;
    // "1.500" (um separador seguido de 3 dígitos, sem vírgula) = milhar; demais casos = decimal
    if (outro || !(soUm && s[ult] === '.' && depois.length === 3)) { inteiro = s.slice(0, ult); frac = depois; }
  }
  inteiro = inteiro.replace(/[.,]/g, '');
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) return null; // mais de 2 casas: ambíguo, recusa
  const c = Number(inteiro + (frac + '00').slice(0, 2));
  return Number.isFinite(c) ? (neg ? -c : c) : null;
}

export function paraData(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (m) return valida(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{2})$/);
  if (m) return valida(2000 + +m[3], +m[2], +m[1]);
  return null;
}
function valida(a: number, m: number, d: number) {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

/* ---------------- OFX ---------------- */
function tag(bloco: string, nome: string) {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : null;
}
function decodificar(buf: Buffer) {
  const cab = buf.subarray(0, 400).toString('latin1');
  const utf8 = /ENCODING:UTF-8/i.test(cab) || /CHARSET:\s*(utf-?8)/i.test(cab);
  const t = buf.toString('utf8');
  return utf8 || !t.includes('�') ? t : buf.toString('latin1');
}
export function lerOfx(buf: Buffer): Extrato {
  const txt = decodificar(buf);
  if (!/<OFX>/i.test(txt)) throw new ExtratoIlegivel('Arquivo OFX inválido: estrutura <OFX> não encontrada.');
  const movimentos: Movimento[] = []; const erros: Extrato['erros'] = [];
  const re = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi;
  let m: RegExpExecArray | null; let n = 0;
  while ((m = re.exec(txt))) {
    n++;
    const b = m[1];
    const data = paraData(tag(b, 'DTPOSTED') ?? '');
    const valor = paraCentavos((tag(b, 'TRNAMT') ?? '').replace(',', '.'));
    const nome = tag(b, 'NAME'), memo = tag(b, 'MEMO');
    const desc = [nome, memo].filter(Boolean).join(' - ');
    if (!data || valor === null || !desc) { erros.push({ linha: n, motivo: !data ? 'data inválida' : valor === null ? 'valor inválido' : 'sem descrição' }); continue; }
    movimentos.push({ data, descricao: desc, valor, saldo: null, idExterno: tag(b, 'FITID'), documento: tag(b, 'CHECKNUM') });
  }
  if (!movimentos.length && !erros.length) throw new ExtratoIlegivel('Nenhuma movimentação encontrada no OFX.');
  const bal = txt.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i);
  return {
    formato: 'ofx', movimentos, erros,
    conta: { banco: tag(txt, 'BANKID') ?? undefined, agencia: tag(txt, 'BRANCHID') ?? undefined, conta: tag(txt, 'ACCTID') ?? undefined },
    saldoFinalInformado: bal ? paraCentavos(bal[1].replace(',', '.')) : null,
  };
}

/* ---------------- Tabelas (CSV / XLSX) ---------------- */
type Linha = unknown[];
const SINONIMOS: Record<string, string[]> = {
  data: ['data', 'data movimento', 'data lancamento', 'dt'],
  descricao: ['descricao', 'historico', 'lancamento', 'descricao do lancamento', 'detalhes'],
  documento: ['documento', 'docto', 'numero documento', 'n documento', 'no documento', 'identificador', 'id da operacao', 'id', 'codigo'],
  valor: ['valor', 'valor r', 'valor liquido', 'valor liquido r'],
  debito: ['debito', 'debito r', 'saida', 'saidas'],
  credito: ['credito', 'credito r', 'entrada', 'entradas'],
  tipo: ['tipo', 'tipo de transacao', 'natureza', 'd c'],
  saldo: ['saldo', 'saldo r'],
};
function mapear(cab: Linha) {
  const idx: Record<string, number> = {};
  const nomes = cab.map(sem);
  for (const [campo, syn] of Object.entries(SINONIMOS)) {
    const i = nomes.findIndex((n) => syn.includes(n));
    if (i >= 0) idx[campo] = i;
  }
  return idx;
}
function acharCabecalho(linhas: Linha[]) {
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const idx = mapear(linhas[i]);
    if (idx.data !== undefined && idx.descricao !== undefined && (idx.valor !== undefined || idx.debito !== undefined || idx.credito !== undefined)) return { i, idx };
  }
  return null;
}
function detectarSeparador(txt: string) {
  const l = txt.split(/\r?\n/).slice(0, 15).join('\n');
  const c = { ';': (l.match(/;/g) ?? []).length, ',': (l.match(/,/g) ?? []).length, '\t': (l.match(/\t/g) ?? []).length };
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]) as ';' | ',' | '\t';
}
function parseCsv(txt: string, sep: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}

function linhasParaMovimentos(linhas: Linha[], formato: 'csv' | 'xlsx'): Extrato {
  const h = acharCabecalho(linhas);
  if (!h) throw new ExtratoIlegivel('Não encontrei as colunas de data, descrição e valor. Confira se o arquivo é um extrato exportado pelo banco.');
  const { i: hi, idx } = h;
  const movimentos: Movimento[] = []; const erros: Extrato['erros'] = [];
  for (let r = hi + 1; r < linhas.length; r++) {
    const l = linhas[r]; const nlinha = r + 1;
    const cel = (k: string) => (idx[k] !== undefined ? l[idx[k]] : undefined);
    if (l.every((c) => !String(c ?? '').trim())) continue;
    const data = paraData(cel('data'));
    const desc = String(cel('descricao') ?? '').trim();
    if (!data) { if (/saldo|total/i.test(String(l[0] ?? ''))) continue; erros.push({ linha: nlinha, motivo: 'data inválida' }); continue; }
    if (!desc) { erros.push({ linha: nlinha, motivo: 'sem descrição' }); continue; }
    let valor: number | null = null;
    if (idx.debito !== undefined || idx.credito !== undefined) {
      const d = paraCentavos(cel('debito')) ?? 0, c = paraCentavos(cel('credito')) ?? 0;
      if (cel('debito') === undefined && cel('credito') === undefined) valor = null;
      else if (d !== 0 && c !== 0) { erros.push({ linha: nlinha, motivo: 'débito e crédito preenchidos juntos' }); continue; }
      else valor = Math.abs(c) - Math.abs(d);
      if (idx.valor !== undefined && valor === 0) valor = paraCentavos(cel('valor'));
    } else {
      valor = paraCentavos(cel('valor'));
      const tp = sem(cel('tipo'));
      if (valor !== null && tp) {
        if (/deb|saida|pagamento/.test(tp)) valor = -Math.abs(valor);
        else if (/cred|entrada|recebimento/.test(tp)) valor = Math.abs(valor);
      }
    }
    if (valor === null) { erros.push({ linha: nlinha, motivo: 'valor inválido' }); continue; }
    const doc = String(cel('documento') ?? '').trim() || null;
    movimentos.push({ data, descricao: desc, valor, saldo: paraCentavos(cel('saldo')), idExterno: null, documento: doc });
  }
  if (!movimentos.length && !erros.length) throw new ExtratoIlegivel('Nenhuma movimentação encontrada no arquivo.');
  const ultimo = [...movimentos].reverse().find((m) => m.saldo !== null);
  return { formato, movimentos, erros, saldoFinalInformado: ultimo?.saldo ?? null };
}

export async function lerExtrato(nome: string, buf: Buffer): Promise<Extrato> {
  const ext = (nome.split('.').pop() ?? '').toLowerCase();
  if (ext === 'ofx') return lerOfx(buf);
  if (ext === 'csv') {
    const txt = decodificar(buf).replace(/^﻿/, '');
    return linhasParaMovimentos(parseCsv(txt, detectarSeparador(txt)), 'csv');
  }
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new ExtratoIlegivel('Não foi possível abrir a planilha.'); }
    let ultimaFalha: unknown;
    for (const ws of wb.worksheets) {
      const linhas: Linha[] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const v = (row.values as unknown[]).slice(1).map((c) => (c && typeof c === 'object' && !(c instanceof Date) && 'result' in (c as object) ? (c as { result: unknown }).result : c));
        linhas.push(v);
      });
      try { return linhasParaMovimentos(linhas, 'xlsx'); } catch (e) { ultimaFalha = e; }
    }
    throw ultimaFalha instanceof ExtratoIlegivel ? ultimaFalha : new ExtratoIlegivel('Planilha vazia.');
  }
  if (ext === 'pdf') return (await import('./pdf/ler-pdf')).lerPdf(nome, buf);
  throw new ExtratoIlegivel('Formato não suportado. Use OFX, CSV ou XLSX.');
}
