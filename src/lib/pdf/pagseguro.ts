// Leitor do "Extrato da conta" do PagSeguro (PagBank). Layout: Data | Descrição | Valor ("-R$ 1.234,56" saída, "R$ ..." entrada),
// com uma linha "Saldo do dia" ao fim de cada dia. Descrições longas quebram em duas linhas, impressas logo ACIMA e logo
// ABAIXO da linha da data (que fica só com o valor); por isso as partes são juntadas pela posição vertical.

type Lanc = { data: string; historico: string; valor: number; tipo: 'C' | 'D' };
export type ExtPagSeguro = { banco: string; agencia: string; conta: string; saldoAnterior: number | null; saldoFinal: number | null; lancamentos: Lanc[]; diasDivergentes: string[] };

const DATA = /^(\d{2}\/\d{2}\/\d{4})\s*(.*?)\s*(-?)R\$\s*([\d.]+,\d{2})\s*$/;
const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));
const r2 = (n: number) => Math.round(n * 100) / 100;

export const ehPagSeguro = (linhas: string[]) => linhas.slice(0, 40).some((l) => /PagSeguro Internet/i.test(l)) && linhas.some((l) => /Extrato da conta/i.test(l));

export function lerPagSeguro(linhas: string[] & { ys?: number[] }): ExtPagSeguro {
  const ys = linhas.ys ?? linhas.map((_, i) => -i * 20);
  const ag = linhas.map((l) => l.match(/^Ag[êe]ncia\s+(\d+)/i)).find(Boolean)?.[1] ?? '';
  const ct = linhas.map((l) => l.match(/^Conta\s+([\d-]+)/i)).find(Boolean)?.[1] ?? '';
  type Linha = { i: number; y: number; data?: string; desc?: string; valor?: number; saldo?: boolean; texto?: string };
  const ini = linhas.findIndex((l) => /^Data\s+Descri/i.test(l));
  const rows: Linha[] = [];
  linhas.forEach((l, i) => {
    if (i <= ini || /^Data\s+Descri/i.test(l)) return;
    const m = l.trim().match(DATA);
    if (m) rows.push({ i, y: ys[i], data: m[1], desc: m[2].trim(), valor: (m[3] ? -1 : 1) * num(m[4]), saldo: /^Saldo do dia$/i.test(m[2].trim()) });
    else if (l.trim()) rows.push({ i, y: ys[i], texto: l.trim() });
  });
  // partes de descrição quebrada: grudam na linha com data mais próxima (até ~1/2 linha de distância), antes ou depois
  const pre = new Map<number, string[]>(), pos = new Map<number, string[]>();
  rows.forEach((r, k) => {
    if (!r.texto) return;
    let best: { k: number; d: number } | null = null;
    for (const j of [k - 1, k + 1, k - 2, k + 2]) { const o = rows[j]; if (o?.data && !o.saldo) { const d = Math.abs(o.y - r.y); if (d <= 9 && (!best || d < best.d)) best = { k: j, d }; } }
    if (best) (best.k > k ? pre : pos).set(best.k, [...((best.k > k ? pre : pos).get(best.k) ?? []), r.texto!]);
  });
  const lancamentos: Lanc[] = []; const saldos: { data: string; saldo: number }[] = [];
  rows.forEach((r, k) => {
    if (!r.data) return;
    if (r.saldo) { saldos.push({ data: r.data, saldo: r.valor! }); return; }
    const historico = [...(pre.get(k) ?? []), r.desc, ...(pos.get(k) ?? [])].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    lancamentos.push({ data: r.data, historico: historico || 'Lançamento PagSeguro', valor: Math.abs(r.valor!), tipo: r.valor! < 0 ? 'D' : 'C' });
  });
  // saldo anterior = 1º "Saldo do dia" menos o movimento daquele dia; confere cada dia contra o "Saldo do dia" impresso
  const movDia = (d: string) => r2(lancamentos.filter((l) => l.data === d).reduce((s, l) => s + (l.tipo === 'D' ? -l.valor : l.valor), 0));
  const saldoAnterior = saldos.length ? r2(saldos[0].saldo - movDia(saldos[0].data)) : null;
  const diasDivergentes: string[] = []; let corrente = saldoAnterior;
  for (const s of saldos) { if (corrente != null) { corrente = r2(corrente + movDia(s.data)); if (Math.abs(corrente - s.saldo) > 0.005) diasDivergentes.push(s.data); } corrente = s.saldo; }
  return { banco: 'PAGSEGURO', agencia: ag, conta: ct, saldoAnterior, saldoFinal: saldos.length ? saldos[saldos.length - 1].saldo : null, lancamentos, diasDivergentes };
}
