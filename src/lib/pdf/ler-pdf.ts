import { Core, Local } from './core';
import type { Extrato, Movimento } from '../extrato-parser';
import { ExtratoIlegivel } from '../extrato-parser';


const cent = (v: number) => Math.round(v * 100);
const iso = (d: string) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;

type Lanc = { data: string; historico: string; complemento?: string; valor: number; tipo: 'C' | 'D' };
type ExtLocal = {
  banco?: string; agencia?: string; conta?: string; saldoAnterior?: number | null; saldoFinal?: number | null; divergencias?: number; lancamentos: Lanc[]; totais?: unknown;
};

/** PDF → texto posicionado (pdf.js) → leitores por banco; se nenhum reconhecer, tenta o leitor genérico por colunas. */
async function paginasDoPdf(buf: Buffer) {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new ExtratoIlegivel('Este PDF é protegido por senha. Gere o extrato sem senha ou envie em OFX/CSV.');
    throw new ExtratoIlegivel('Não foi possível abrir o PDF. Ele pode estar corrompido.');
  }
  let linhas: string[] = []; let ys: number[] = []; let xs: number[] = []; const pags: unknown[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const l = Core.pdfItemsToLines(tc.items);
    linhas = linhas.concat(l); ys = ys.concat(l.ys.map((y: number) => y - p * 10000)); xs = xs.concat(l.xs);
    pags.push(Core.pdfLinhasXY(tc.items));
  }
  Object.assign(linhas, { ys, xs });
  return { linhas, pags };
}

export async function lerPdf(nome: string, buf: Buffer): Promise<Extrato> {
  const { linhas, pags } = await paginasDoPdf(buf);
  if (linhas.join('').replace(/\s/g, '').length < 40) {
    throw new ExtratoIlegivel('Este PDF não tem texto selecionável (parece digitalizado/foto). Peça ao banco o extrato digital ou envie em OFX/CSV.');
  }
  // Mesma ordem do Conciliador: 1) leitor do banco (texto); 2) se não reconheceu, ou foi o genérico, tenta o leitor por colunas
  // e fica com ele quando o saldo fecha e o do texto não fecha.
  let ext: (ExtLocal & { semMovimento?: boolean; banco?: string }) | null = null;
  try { ext = Local.lerExtrato({ linhas, nome }, Core); } catch { ext = null; }
  if (ext?.semMovimento) throw new ExtratoIlegivel(`Extrato ${ext.banco ?? ''} sem nenhum movimento no período; não há o que importar.`.replace('  ', ' '));
  if (!ext?.lancamentos?.length || (ext as { generico?: boolean }).generico) {
    try {
      const json = Core.extratoJson(pags);
      if (json?.tabela) {
        const rj: ExtLocal | null = Local.tabular(json.tabela, nome, Core);
        if (rj && rj.saldoFinal == null && json.saldoFinal != null) rj.saldoFinal = json.saldoFinal;
        if (rj?.lancamentos?.length) {
          const okJ = Core.conferirSaldo(rj).confere;
          const okR = ext?.lancamentos?.length ? Core.conferirSaldo(ext).confere : false;
          if (!ext?.lancamentos?.length || (okJ && !okR)) ext = rj;
        }
      }
    } catch { /* mantém o resultado do leitor de texto */ }
  }
  if (!ext?.lancamentos?.length) throw new ExtratoIlegivel('Não reconheci o layout deste PDF. Envie o extrato em OFX ou CSV, ou mande este PDF ao escritório para incluirmos o layout do seu banco.');

  const movimentos: Movimento[] = []; const erros: Extrato['erros'] = [];
  ext.lancamentos.forEach((l, i) => {
    const d = Core.parseData(l.data); const valor = cent(Math.abs(l.valor));
    if (!d || !valor) { erros.push({ linha: i + 1, motivo: !d ? 'data inválida' : 'valor inválido' }); return; }
    const desc = [l.historico, l.complemento].filter(Boolean).join(' - ').trim();
    if (!desc) { erros.push({ linha: i + 1, motivo: 'sem descrição' }); return; }
    movimentos.push({ data: iso(d), descricao: desc, valor: l.tipo === 'D' ? -valor : valor, saldo: null, idExterno: null, documento: null });
  });
  if (!movimentos.length) throw new ExtratoIlegivel('Nenhuma movimentação válida encontrada no PDF.');

  // Conferência de saldos feita pelo próprio leitor: só afirma "confere" quando saldo anterior e final existem.
  const c = Core.conferirSaldo(ext);
  return {
    formato: 'pdf', movimentos, erros,
    conta: { banco: ext.banco, agencia: ext.agencia || undefined, conta: ext.conta || undefined },
    saldoFinalInformado: ext.saldoFinal != null ? cent(ext.saldoFinal) : null,
    conferenciaSaldo: {
      saldoAnterior: ext.saldoAnterior != null ? cent(ext.saldoAnterior) : null,
      saldoFinalInformado: ext.saldoFinal != null ? cent(ext.saldoFinal) : null,
      saldoCalculado: c.saldoCalculado != null ? cent(c.saldoCalculado) : null,
      confere: ext.saldoAnterior != null && ext.saldoFinal != null ? !!c.confere : null,
      diferenca: c.diferenca != null ? cent(c.diferenca) : null,
    },
  };
}
