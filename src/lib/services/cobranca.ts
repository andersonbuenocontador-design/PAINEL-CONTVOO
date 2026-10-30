import type pg from 'pg';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { aplicaNaCompetencia, competenciaSchema, situacaoCompetencia } from './documentos';
import { criarPendencia } from './pendencias';
import { registrar } from './auditoria';

type Runner = Pick<pg.PoolClient, 'query'>;
const ABERTA = `origem='cobranca_documentos' AND situacao IN ('aberta','respondida')`;

/** Cobranças em andamento por empresa, para a tela Entregas do mês. */
export async function cobrancasAbertas(actor: Actor, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  const { rows } = await query(`SELECT DISTINCT ON (empresa_id) empresa_id, criado_em FROM pendencias WHERE competencia=$1 AND ${ABERTA} ORDER BY empresa_id, criado_em DESC`, [competencia]);
  return new Map(rows.map((r) => [r.empresa_id as string, r.criado_em as Date]));
}

/** Botão "Cobrar envio": cria no painel do cliente uma solicitação com a lista do que falta (pendente ou recusado). */
export async function cobrarDocumentos(actor: Actor, empresaId: string, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  const s = await situacaoCompetencia(actor, empresaId, competencia);
  const faltam = s.itens.filter((i) => i.obrigatorio && (i.situacao === 'pendente' || i.situacao === 'rejeitado'));
  if (!faltam.length) throw new AppError('Esta empresa já enviou todos os documentos do mês.');
  if ((await query(`SELECT 1 FROM pendencias WHERE empresa_id=$1 AND competencia=$2 AND ${ABERTA}`, [empresaId, competencia])).rowCount) throw new AppError('Já existe uma cobrança em andamento para este mês.');
  const [ano, mes] = competencia.split('-');
  const lista = faltam.map((i) => `• ${i.nome}${i.instituicao ? ` — ${i.instituicao}` : ''}${i.situacao === 'rejeitado' ? ` (recusado${i.motivo_rejeicao ? `: ${i.motivo_rejeicao}` : ''}; envie de novo)` : ''}`).join('\n');
  const id = await criarPendencia(actor, empresaId, { categoria: 'documento', competencia, descricao: `Faltam documentos de ${mes}/${ano}:\n${lista}\n\nEnvie pelo cartão "Documentos do mês" do painel.` });
  await query(`UPDATE pendencias SET origem='cobranca_documentos' WHERE id=$1`, [id]);
  return id;
}

/** Chamado quando o cliente envia um documento: se nada mais falta no mês, a cobrança se resolve sozinha. */
export async function resolverCobrancaSeCompleto(c: Runner, actor: Actor, empresaId: string, competencia: string) {
  const abertas = (await c.query(`SELECT id FROM pendencias WHERE empresa_id=$1 AND competencia=$2 AND ${ABERTA}`, [empresaId, competencia])).rows;
  if (!abertas.length) return;
  const { rows } = await c.query(
    `SELECT x.frequencia, a.situacao FROM exigencias x
       LEFT JOIN LATERAL (SELECT situacao FROM arquivos WHERE exigencia_id=x.id AND competencia=$2 ORDER BY versao DESC LIMIT 1) a ON true
      WHERE x.empresa_id=$1 AND x.ativo AND x.obrigatorio`, [empresaId, competencia]);
  const falta = rows.some((r) => (aplicaNaCompetencia(r.frequencia, competencia) || r.situacao) && (!r.situacao || r.situacao === 'rejeitado'));
  if (falta) return;
  for (const p of abertas) {
    await c.query(`UPDATE pendencias SET situacao='resolvida', resolvida_em=now(), resolvida_por=$2, atualizado_em=now() WHERE id=$1`, [p.id, actor.id]);
    await c.query('INSERT INTO pendencia_mensagens(pendencia_id,usuario_id,texto) VALUES ($1,$2,$3)', [p.id, actor.id, 'Documentos enviados. Cobrança encerrada automaticamente.']);
    await registrar(c, { usuarioId: actor.id, empresaId, acao: 'pendencia.resolver_cobranca_automatica', entidade: 'pendencia', entidadeId: p.id });
  }
}
