// Leitor do "Extrato de conta corrente" da Stone. Colunas: DATA | TIPO | DESCRIÇÃO | VALOR | SALDO | CONTRAPARTE, do mais recente
// para o mais antigo. Cada lançamento é um bloco: o nome (às vezes em 2–3 linhas, repetido na coluna CONTRAPARTE) fica acima e
// abaixo da linha da data, e a última linha da DESCRIÇÃO é o tipo ("Pagamento", "Transferência | Pix", "Rendimento"...).
// Por isso a leitura usa a posição (x, y) de cada texto: separa as colunas e junta as linhas do mesmo bloco.

type Celula = { x0: number; x1: number; s: string };
type LinhaXY = { y: number; cs: Celula[] };
type Lanc = { data: string; historico: string; valor: number; tipo: 'C' | 'D' };
export type ExtStone = { banco: string; agencia: string; conta: string; saldoAnterior: number | null; saldoFinal: number | null; lancamentos: Lanc[] };

const num = (v: string) => Number(v.replace(/[^\d,]/g, '').replace(',', '.'));
const r2 = (n: number) => Math.round(n * 100) / 100;
const texto = (l: LinhaXY) => l.cs.map((c) => c.s).join(' ');

export const ehStone = (linhas: string[]) => linhas.slice(0, 30).some((l) => /Stone Institui[çc][ãa]o de Pagamento/i.test(l)) && linhas.some((l) => /Extrato de conta corrente/i.test(l));

export function lerStone(pags: LinhaXY[][]): ExtStone {
  const todas = pags.flat();
  const dadosIdx = todas.findIndex((l) => /Institui[çc][ãa]o/i.test(texto(l)) && /Ag[êe]ncia/i.test(texto(l)));
  const dados = dadosIdx >= 0 ? todas[dadosIdx + 1] : undefined;
  // o PDF traz caracteres invisíveis no meio dos números: fica só com dígitos e hífen
  const nums = (dados?.cs ?? []).filter((c) => c.x0 > 300).map((c) => c.s.replace(/[^\d-]/g, '')).filter((x) => /^\d/.test(x));
  const agencia = nums.find((x) => x.length === 4) ?? '';
  const conta = nums.filter((x) => x !== agencia && x.replace(/-/g, '').length >= 5).pop() ?? '';

  type Bloco = { data?: string; tipo?: 'C' | 'D'; valor?: number; saldo?: number; desc: string[] };
  const blocos: Bloco[] = [];
  for (const pag of pags) {
    const h = pag.findIndex((l) => /^DATA$/i.test(l.cs[0]?.s.trim() ?? '') && l.cs.some((c) => /^VALOR$/i.test(c.s.trim())));
    if (h < 0) continue;
    const col = (re: RegExp) => pag[h].cs.find((c) => re.test(c.s.trim()))?.x0 ?? 0;
    const xTipo = col(/^TIPO$/i), xDesc = col(/^DESCRI/i), xValor = col(/^VALOR$/i), xContra = col(/^CONTRAPARTE$/i) || Infinity;
    let atual: Bloco | null = null; let yAnt = Infinity;
    for (const l of pag.slice(h + 1)) {
      const t = texto(l);
      if (/Informa[çc][õo]es do Comprovante|Ouvidoria|Extrato de conta corrente|Emitido em/i.test(t)) break;
      if (!atual || yAnt - l.y > 16) { atual = { desc: [] }; blocos.push(atual); } // espaço maior entre linhas = novo lançamento
      yAnt = l.y;
      const data = l.cs.find((c) => c.x0 < xTipo - 2 && /^\d{2}\/\d{2}\/\d{2}$/.test(c.s.trim()))?.s.trim();
      if (data) {
        atual.data = data;
        const tipo = l.cs.find((c) => c.x0 >= xTipo - 2 && c.x0 < xDesc - 2)?.s.trim() ?? '';
        const valores = l.cs.filter((c) => c.x0 >= xValor - 25 && c.x0 < xContra - 5).map((c) => c.s).join(' ').match(/-?\s*R\$\s*[\d.]+,\d{2}/g) ?? [];
        if (valores[0]) { atual.valor = num(valores[0]); atual.tipo = /-/.test(valores[0]) || /sa[íi]da/i.test(tipo) ? 'D' : 'C'; }
        if (valores[1]) atual.saldo = (/-/.test(valores[1]) ? -1 : 1) * num(valores[1]);
      }
      const d = l.cs.filter((c) => c.x0 >= xDesc - 2 && c.x0 < xValor - 25).map((c) => c.s.trim()).filter(Boolean).join(' ');
      if (d) atual.desc.push(d);
    }
  }
  const lancamentos: Lanc[] = []; const saldos: number[] = [];
  for (const b of blocos) {
    if (!b.data || b.valor == null || !b.tipo) continue;
    // "Pagamento - AUTO PECAS MILANI LTDA": tipo do lançamento primeiro e o nome depois (o nome vira o complemento da planilha)
    const tipoLanc = b.desc.length > 1 ? b.desc[b.desc.length - 1] : '';
    const nome = (tipoLanc ? b.desc.slice(0, -1) : b.desc).join(' ').replace(/\s+/g, ' ').trim();
    const [dd, mm, aa] = b.data.split('/');
    lancamentos.push({ data: `${dd}/${mm}/20${aa}`, historico: [tipoLanc, nome].filter(Boolean).join(' - ') || 'Lançamento Stone', valor: b.valor, tipo: b.tipo });
    if (b.saldo != null) saldos.push(b.saldo);
  }
  lancamentos.reverse(); saldos.reverse(); // do mais antigo para o mais recente
  const primeiro = lancamentos[0];
  const saldoAnterior = primeiro && saldos.length === lancamentos.length ? r2(saldos[0] - (primeiro.tipo === 'D' ? -primeiro.valor : primeiro.valor)) : null;
  return { banco: 'STONE', agencia, conta, saldoAnterior, saldoFinal: saldos.length ? saldos[saldos.length - 1] : null, lancamentos };
}
