import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { obterEmpresa } from './empresas';
import { registrar } from './auditoria';
import { competenciaSchema } from './documentos';

export const TIPOS_RETIRADA = { pro_labore: 'Pró-labore', lucros: 'Distribuição de lucros', outras: 'Outras retiradas' } as const;
export type TipoRetirada = keyof typeof TIPOS_RETIRADA;

/** "1.234,56", "1234,56", "1234.56", "R$ 50" → 1234.56. Inválido → NaN. */
export function valorBR(t: string): number {
  const s = t.replace(/R\$|\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) return NaN;
  const n = /,/.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Math.round(n * 100) / 100;
}

const lancamento = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  socio: z.string().trim().min(2, 'Informe o nome do sócio.').max(120, 'Nome do sócio muito longo.'),
  tipo: z.enum(['pro_labore', 'lucros', 'outras'], { message: 'Escolha o tipo da retirada.' }),
  valor: z.string().transform((v, ctx) => { const n = valorBR(v); if (!(n > 0) || n > 999_999_999) { ctx.addIssue({ code: 'custom', message: 'Valor inválido. Use, por exemplo, 1.500,00.' }); return z.NEVER; } return n; }),
  observacao: z.string().trim().max(200, 'Observação muito longa (máx. 200).').optional().transform((v) => v || null),
});

async function envio(empresaId: string, competencia: string) {
  return (await query(`SELECT r.sem_retiradas, r.enviado_em, u.nome enviado_por FROM retiradas_envios r JOIN usuarios u ON u.id=r.enviado_por WHERE r.empresa_id=$1 AND r.competencia=$2`, [empresaId, competencia])).rows[0] as
    { sem_retiradas: boolean; enviado_em: Date; enviado_por: string } | undefined;
}
const bloqueioCliente = 'As retiradas deste mês já foram enviadas ao escritório. Para corrigir, fale com o escritório.';

export async function listarRetiradas(actor: Actor, empresaId: string, competencia: string) {
  const emp = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  const itens = (await query(
    `SELECT r.id, r.data::text data, r.socio_nome, r.tipo, r.valor::text valor, r.observacao, r.criado_em, u.nome criado_por
       FROM retiradas r JOIN usuarios u ON u.id=r.criado_por
      WHERE r.empresa_id=$1 AND r.competencia=$2 AND r.removido_em IS NULL ORDER BY r.data, r.criado_em`, [emp.id, competencia])).rows as
    { id: string; data: string; socio_nome: string; tipo: TipoRetirada; valor: string; observacao: string | null; criado_em: Date; criado_por: string }[];
  const porSocio = new Map<string, Record<TipoRetirada | 'total', number>>();
  for (const i of itens) {
    const k = i.socio_nome; const t = porSocio.get(k) ?? { pro_labore: 0, lucros: 0, outras: 0, total: 0 };
    t[i.tipo] = Math.round((t[i.tipo] + Number(i.valor)) * 100) / 100; t.total = Math.round((t.total + Number(i.valor)) * 100) / 100; porSocio.set(k, t);
  }
  const total = Math.round(itens.reduce((s, i) => s + Number(i.valor), 0) * 100) / 100;
  return { itens, totais: [...porSocio].map(([socio, t]) => ({ socio, ...t })), total, envio: await envio(emp.id, competencia) };
}

/** Nomes para sugerir: sócios cadastrados pelo escritório + nomes já usados pelo cliente. */
export async function sugestoesSocios(actor: Actor, empresaId: string) {
  const emp = await obterEmpresa(actor, empresaId);
  return (await query(`SELECT nome FROM socios WHERE empresa_id=$1 AND ativo UNION SELECT DISTINCT socio_nome FROM retiradas WHERE empresa_id=$1 AND removido_em IS NULL ORDER BY 1`, [emp.id])).rows.map((r) => r.nome as string);
}

export async function lancarRetirada(actor: Actor, empresaId: string, competencia: string, input: z.input<typeof lancamento>) {
  const emp = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  const d = lancamento.parse(input);
  if (d.data.slice(0, 7) !== competencia) throw new AppError(`A data precisa ser dentro de ${competencia.slice(5)}/${competencia.slice(0, 4)}.`);
  if (Number.isNaN(new Date(d.data + 'T00:00:00Z').getTime()) || new Date(d.data + 'T00:00:00Z').toISOString().slice(0, 10) !== d.data) throw new AppError('Data inválida.');
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`retiradas:${emp.id}:${competencia}`]);
    if (actor.papel === 'cliente' && (await c.query('SELECT 1 FROM retiradas_envios WHERE empresa_id=$1 AND competencia=$2', [emp.id, competencia])).rowCount) throw new AppError(bloqueioCliente);
    const r = await c.query(`INSERT INTO retiradas(empresa_id,competencia,data,socio_nome,tipo,valor,observacao,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [emp.id, competencia, d.data, d.socio, d.tipo, d.valor, d.observacao, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: emp.id, acao: 'retirada.lancar', entidade: 'retirada', entidadeId: r.rows[0].id, detalhes: { competencia, tipo: d.tipo, valor: d.valor } });
    return r.rows[0].id as string;
  });
}

export async function removerRetirada(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError('Lançamento não encontrado.', 'nao_encontrado');
  const r = (await query('SELECT * FROM retiradas WHERE id=$1 AND removido_em IS NULL', [id])).rows[0];
  if (!r) throw new AppError('Lançamento não encontrado.', 'nao_encontrado');
  await obterEmpresa(actor, r.empresa_id);
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`retiradas:${r.empresa_id}:${r.competencia}`]);
    if (actor.papel === 'cliente' && (await c.query('SELECT 1 FROM retiradas_envios WHERE empresa_id=$1 AND competencia=$2', [r.empresa_id, r.competencia])).rowCount) throw new AppError(bloqueioCliente);
    await c.query('UPDATE retiradas SET removido_em=now(), removido_por=$2 WHERE id=$1', [id, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: r.empresa_id, acao: 'retirada.remover', entidade: 'retirada', entidadeId: id, detalhes: { competencia: r.competencia, valor: r.valor } });
  });
}

/** Cliente fecha o mês: envia os lançamentos ao escritório, ou declara que não houve retiradas. */
export async function enviarRetiradas(actor: Actor, empresaId: string, competencia: string, semRetiradas: boolean) {
  const emp = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`retiradas:${emp.id}:${competencia}`]);
    if ((await c.query('SELECT 1 FROM retiradas_envios WHERE empresa_id=$1 AND competencia=$2', [emp.id, competencia])).rowCount) throw new AppError('Este mês já foi enviado ao escritório.');
    const n = Number((await c.query('SELECT count(*) n FROM retiradas WHERE empresa_id=$1 AND competencia=$2 AND removido_em IS NULL', [emp.id, competencia])).rows[0].n);
    if (semRetiradas && n) throw new AppError('Há retiradas lançadas neste mês. Exclua-as ou use "Enviar ao escritório".');
    if (!semRetiradas && !n) throw new AppError('Nenhuma retirada lançada. Se não houve retiradas, use "Não houve retiradas neste mês".');
    await c.query('INSERT INTO retiradas_envios(empresa_id,competencia,sem_retiradas,enviado_por) VALUES ($1,$2,$3,$4)', [emp.id, competencia, semRetiradas, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: emp.id, acao: semRetiradas ? 'retiradas.sem_retiradas' : 'retiradas.enviar', entidade: 'retiradas', detalhes: { competencia, lancamentos: n } });
  });
}

/** Escritório devolve o mês ao cliente para correção. */
export async function reabrirRetiradas(actor: Actor, empresaId: string, competencia: string) {
  exigirAdmin(actor); const emp = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  await tx(async (c) => {
    const r = await c.query('DELETE FROM retiradas_envios WHERE empresa_id=$1 AND competencia=$2', [emp.id, competencia]);
    if (!r.rowCount) throw new AppError('Este mês ainda não foi enviado pelo cliente.');
    await registrar(c, { usuarioId: actor.id, empresaId: emp.id, acao: 'retiradas.reabrir', entidade: 'retiradas', detalhes: { competencia } });
  });
}
