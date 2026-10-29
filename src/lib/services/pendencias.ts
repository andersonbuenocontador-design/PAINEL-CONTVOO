import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { enfileirar, textoAviso } from '../notificacoes';
import { competenciaSchema } from './documentos';
import { obterEmpresa } from './empresas';
import { registrar } from './auditoria';
import type pg from 'pg';

type Runner = Pick<pg.PoolClient, 'query'>;
export const CATEGORIAS = { documento: 'Documento', classificacao: 'Correção de classificação', informacao: 'Informação', outro: 'Outro' } as const;
export type Categoria = keyof typeof CATEGORIAS;
export type SituacaoPend = 'aberta' | 'respondida' | 'resolvida' | 'cancelada';
const vazio = (s?: string | null) => (s && s.trim() ? s.trim() : null);

const novaSchema = z.object({
  competencia: z.string().optional().transform(vazio).refine((v) => !v || competenciaSchema.safeParse(v).success, 'Competência inválida.'),
  categoria: z.enum(['documento', 'classificacao', 'informacao', 'outro'], { message: 'Escolha a categoria.' }),
  descricao: z.string().trim().min(3, 'Descreva o que o cliente precisa fazer.').max(2000),
  prazo: z.string().optional().transform(vazio).refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Prazo inválido.'),
  responsavelId: z.string().uuid().nullish().transform((v) => v ?? null),
});

async function clientesDaEmpresa(r: Runner, empresaId: string) {
  return (await r.query(`SELECT u.id,u.nome FROM usuarios u JOIN usuario_empresas ue ON ue.usuario_id=u.id WHERE ue.empresa_id=$1 AND u.ativo AND u.papel='cliente' AND u.receber_emails`, [empresaId])).rows as { id: string; nome: string }[];
}
/** Quem no escritório recebe o aviso: o responsável pela pendência/empresa; sem responsável, os administradores ativos. */
async function equipeDoEscritorio(r: Runner, p: { responsavel_id: string | null; empresa_id: string }) {
  const resp = p.responsavel_id ?? (await r.query('SELECT responsavel_id FROM empresas WHERE id=$1', [p.empresa_id])).rows[0]?.responsavel_id;
  const sql = resp ? { t: `SELECT id,nome FROM usuarios WHERE id=$1 AND ativo AND receber_emails`, p: [resp] } : { t: `SELECT id,nome FROM usuarios WHERE papel='admin' AND ativo AND receber_emails`, p: [] };
  return (await r.query(sql.t, sql.p)).rows as { id: string; nome: string }[];
}

export async function criarPendencia(actor: Actor, empresaId: string, input: z.input<typeof novaSchema>) {
  exigirAdmin(actor); const e = await obterEmpresa(actor, empresaId); const d = novaSchema.parse(input);
  return tx(async (c) => {
    if (d.responsavelId && !(await c.query(`SELECT 1 FROM usuarios WHERE id=$1 AND papel='admin' AND ativo`, [d.responsavelId])).rowCount) throw new AppError('Responsável inválido.');
    const r = await c.query(`INSERT INTO pendencias(empresa_id,competencia,categoria,descricao,prazo,responsavel_id,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [e.id, d.competencia, d.categoria, d.descricao, d.prazo, d.responsavelId, actor.id]);
    const id = r.rows[0].id as string;
    await c.query('INSERT INTO pendencia_mensagens(pendencia_id,usuario_id,texto) VALUES ($1,$2,$3)', [id, actor.id, d.descricao]);
    for (const u of await clientesDaEmpresa(c, e.id)) await enfileirar(c, { destinatarioId: u.id, empresaId: e.id, pendenciaId: id, tipo: 'pendencia_nova', assunto: 'Nova solicitação do escritório', corpo: textoAviso(u.nome, 'O escritório registrou uma nova solicitação para você.', `/cliente/${e.id}/pendencias`) });
    await registrar(c, { usuarioId: actor.id, empresaId: e.id, acao: 'pendencia.criar', entidade: 'pendencia', entidadeId: id, detalhes: { categoria: d.categoria, prazo: d.prazo } });
    return id;
  });
}
async function carregar(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError('Pendência não encontrada.', 'nao_encontrado');
  const p = (await query('SELECT * FROM pendencias WHERE id=$1', [id])).rows[0];
  if (!p) throw new AppError('Pendência não encontrada.', 'nao_encontrado');
  await obterEmpresa(actor, p.empresa_id); // mesma regra de acesso da empresa
  if (actor.papel === 'cliente' && p.situacao === 'cancelada') throw new AppError('Pendência não encontrada.', 'nao_encontrado');
  return p;
}
export async function responder(actor: Actor, id: string, texto: string) {
  const t = z.string().trim().min(1, 'Escreva a resposta.').max(2000).parse(texto);
  const p = await carregar(actor, id);
  if (p.situacao === 'resolvida' || p.situacao === 'cancelada') throw new AppError('Esta pendência já foi encerrada.');
  await tx(async (c) => {
    await c.query('INSERT INTO pendencia_mensagens(pendencia_id,usuario_id,texto) VALUES ($1,$2,$3)', [id, actor.id, t]);
    const nova: SituacaoPend = actor.papel === 'cliente' ? 'respondida' : 'aberta'; // cliente respondeu: aguarda o escritório; escritório escreveu: aguarda o cliente
    await c.query('UPDATE pendencias SET situacao=$2, atualizado_em=now() WHERE id=$1', [id, nova]);
    if (actor.papel === 'cliente') {
      for (const u of await equipeDoEscritorio(c, p)) await enfileirar(c, { destinatarioId: u.id, empresaId: p.empresa_id, pendenciaId: id, tipo: 'pendencia_resposta_cliente', assunto: 'Um cliente respondeu a uma solicitação', corpo: textoAviso(u.nome, 'Um cliente respondeu a uma solicitação.', `/admin/empresas/${p.empresa_id}/pendencias`) });
    } else {
      for (const u of await clientesDaEmpresa(c, p.empresa_id)) await enfileirar(c, { destinatarioId: u.id, empresaId: p.empresa_id, pendenciaId: id, tipo: 'pendencia_resposta_escritorio', assunto: 'O escritório respondeu à sua solicitação', corpo: textoAviso(u.nome, 'O escritório escreveu uma nova mensagem em uma solicitação.', `/cliente/${p.empresa_id}/pendencias`) });
    }
    await registrar(c, { usuarioId: actor.id, empresaId: p.empresa_id, acao: 'pendencia.responder', entidade: 'pendencia', entidadeId: id });
  });
}
async function mudar(actor: Actor, id: string, de: SituacaoPend[], para: SituacaoPend, acao: string, msg: string) {
  exigirAdmin(actor); const p = await carregar(actor, id);
  if (!de.includes(p.situacao)) throw new AppError(msg);
  await tx(async (c) => {
    await c.query(`UPDATE pendencias SET situacao=$2, atualizado_em=now(), resolvida_em=CASE WHEN $2='resolvida' THEN now() ELSE NULL END, resolvida_por=CASE WHEN $2='resolvida' THEN $3::uuid ELSE NULL END WHERE id=$1`, [id, para, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: p.empresa_id, acao, entidade: 'pendencia', entidadeId: id });
  });
}
export const resolverPendencia = (a: Actor, id: string) => mudar(a, id, ['aberta', 'respondida'], 'resolvida', 'pendencia.resolver', 'Só dá para resolver uma pendência em andamento.');
export const reabrirPendencia = (a: Actor, id: string) => mudar(a, id, ['resolvida', 'cancelada'], 'aberta', 'pendencia.reabrir', 'Só dá para reabrir uma pendência encerrada.');
export const cancelarPendencia = (a: Actor, id: string) => mudar(a, id, ['aberta', 'respondida'], 'cancelada', 'pendencia.cancelar', 'Só dá para cancelar uma pendência em andamento.');

export type Pend = { id: string; empresa_id: string; competencia: string | null; categoria: Categoria; descricao: string; prazo: string | null; situacao: SituacaoPend; criado_em: string; vencida: boolean; responsavel: string | null; mensagens: number };
const SEL = `SELECT p.id,p.empresa_id,p.competencia,p.categoria,p.descricao,p.prazo::text prazo,p.situacao,p.criado_em,
   (p.prazo IS NOT NULL AND p.situacao IN ('aberta','respondida') AND p.prazo < (now() AT TIME ZONE 'America/Sao_Paulo')::date) vencida, r.nome responsavel,
   (SELECT count(*)::int FROM pendencia_mensagens m WHERE m.pendencia_id=p.id) mensagens, e.razao_social
   FROM pendencias p JOIN empresas e ON e.id=p.empresa_id LEFT JOIN usuarios r ON r.id=p.responsavel_id`;
export async function listarPendencias(actor: Actor, empresaId: string) {
  const e = await obterEmpresa(actor, empresaId);
  return (await query(`${SEL} WHERE p.empresa_id=$1 ${actor.papel === 'cliente' ? `AND p.situacao<>'cancelada'` : ''} ORDER BY (p.situacao IN ('aberta','respondida')) DESC, vencida DESC, p.prazo NULLS LAST, p.criado_em DESC`, [e.id])).rows as (Pend & { razao_social: string })[];
}
export async function mensagensDaPendencia(actor: Actor, id: string) {
  await carregar(actor, id);
  return (await query(`SELECT m.id,m.texto,m.criado_em,u.nome,u.papel FROM pendencia_mensagens m JOIN usuarios u ON u.id=m.usuario_id WHERE m.pendencia_id=$1 ORDER BY m.id`, [id])).rows as { id: number; texto: string; criado_em: string; nome: string; papel: string }[];
}
/** Para a tela inicial do cliente: quantas aguardam ele e quantas estão vencidas. */
export async function resumoPendencias(actor: Actor, empresaId: string) {
  const e = await obterEmpresa(actor, empresaId);
  const r = (await query(`SELECT count(*) FILTER (WHERE situacao='aberta')::int aguardando, count(*) FILTER (WHERE situacao IN ('aberta','respondida') AND prazo < (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int vencidas, count(*) FILTER (WHERE situacao IN ('aberta','respondida'))::int abertas FROM pendencias WHERE empresa_id=$1`, [e.id])).rows[0];
  return r as { aguardando: number; vencidas: number; abertas: number };
}
export type FiltroPend = { situacao?: SituacaoPend | 'em_andamento'; categoria?: Categoria; vencidas?: boolean; busca?: string; competencia?: string };
/** Visão do escritório: todas as empresas, com filtros. */
export async function listarPendenciasEscritorio(actor: Actor, f: FiltroPend = {}) {
  exigirAdmin(actor); const w: string[] = [`e.situacao='ativa'`]; const par: unknown[] = [];
  if (f.situacao === 'em_andamento') w.push(`p.situacao IN ('aberta','respondida')`); else if (f.situacao) { par.push(f.situacao); w.push(`p.situacao=$${par.length}`); }
  if (f.categoria) { par.push(f.categoria); w.push(`p.categoria=$${par.length}`); }
  if (f.competencia) { par.push(competenciaSchema.parse(f.competencia)); w.push(`p.competencia=$${par.length}`); }
  if (f.vencidas) w.push(`p.prazo IS NOT NULL AND p.situacao IN ('aberta','respondida') AND p.prazo < (now() AT TIME ZONE 'America/Sao_Paulo')::date`);
  if (f.busca?.trim()) { par.push(`%${f.busca.trim().replace(/[\\%_]/g, '\\$&')}%`); w.push(`(e.razao_social ILIKE $${par.length} OR e.nome_fantasia ILIKE $${par.length})`); }
  return (await query(`${SEL} WHERE ${w.join(' AND ')} ORDER BY vencida DESC, (p.situacao IN ('aberta','respondida')) DESC, p.prazo NULLS LAST, p.criado_em DESC LIMIT 1000`, par)).rows as (Pend & { razao_social: string })[];
}
