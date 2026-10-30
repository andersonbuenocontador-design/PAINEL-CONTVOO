import type pg from 'pg';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { aplicaNaCompetencia, competenciaSchema, situacaoCompetencia } from './documentos';
import { criarPendencia } from './pendencias';
import { registrar } from './auditoria';

type Runner = Pick<pg.PoolClient, 'query'>;
const ABERTA = `origem='cobranca_documentos' AND situacao IN ('aberta','respondida')`;

/** Cobranças em andamento por empresa, para a tela Entregas do mês: quando foi cobrado e o último lembrete. */
export async function cobrancasAbertas(actor: Actor, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  const { rows } = await query(
    `SELECT DISTINCT ON (p.empresa_id) p.empresa_id, p.id, p.criado_em, (SELECT max(m.criado_em) FROM pendencia_mensagens m WHERE m.pendencia_id=p.id) ultimo, (SELECT count(*)::int FROM pendencia_mensagens m WHERE m.pendencia_id=p.id) msgs
       FROM pendencias p WHERE p.competencia=$1 AND ${ABERTA} ORDER BY p.empresa_id, p.criado_em DESC`, [competencia]);
  return new Map(rows.map((r) => [r.empresa_id as string, { id: r.id as string, criado_em: r.criado_em as Date, ultimo: r.ultimo as Date, lembretes: Math.max(0, (r.msgs as number) - 1) }]));
}

/** Texto da cobrança: o que falta no mês (pendente ou recusado, com o motivo). */
export function textoCobranca(competencia: string, faltam: { nome: string; instituicao: string | null; situacao: string; motivo_rejeicao: string | null }[], lembrete = false) {
  const [ano, mes] = competencia.split('-');
  const lista = faltam.map((i) => `• ${i.nome}${i.instituicao ? ` — ${i.instituicao}` : ''}${i.situacao === 'rejeitado' ? ` (recusado${i.motivo_rejeicao ? `: ${i.motivo_rejeicao}` : ''}; envie de novo)` : ''}`).join('\n');
  return `${lembrete ? 'Lembrete: ainda faltam' : 'Faltam'} documentos de ${mes}/${ano}:\n${lista}\n\nEnvie pelo cartão "Documentos do mês" do painel.`;
}

/** Botão "Cobrar envio": 1ª vez cria no painel do cliente uma solicitação com a lista do que falta;
 *  nas seguintes, manda um lembrete na mesma solicitação (lista atualizada) e ela volta a "aguardando o cliente". */
export async function cobrarDocumentos(actor: Actor, empresaId: string, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  const s = await situacaoCompetencia(actor, empresaId, competencia);
  const faltam = s.itens.filter((i) => i.obrigatorio && (i.situacao === 'pendente' || i.situacao === 'rejeitado'));
  if (!faltam.length) throw new AppError('Esta empresa já enviou todos os documentos do mês.');
  const aberta = (await query(`SELECT id FROM pendencias WHERE empresa_id=$1 AND competencia=$2 AND ${ABERTA} ORDER BY criado_em DESC LIMIT 1`, [empresaId, competencia])).rows[0];
  if (aberta) {
    await tx(async (c) => {
      await c.query('INSERT INTO pendencia_mensagens(pendencia_id,usuario_id,texto) VALUES ($1,$2,$3)', [aberta.id, actor.id, textoCobranca(competencia, faltam, true)]);
      await c.query(`UPDATE pendencias SET situacao='aberta', atualizado_em=now() WHERE id=$1`, [aberta.id]);
      await registrar(c, { usuarioId: actor.id, empresaId, acao: 'pendencia.lembrete_cobranca', entidade: 'pendencia', entidadeId: aberta.id, detalhes: { competencia, faltam: faltam.length } });
    });
    return { id: aberta.id as string, lembrete: true };
  }
  const id = await criarPendencia(actor, empresaId, { categoria: 'documento', competencia, descricao: textoCobranca(competencia, faltam) });
  await query(`UPDATE pendencias SET origem='cobranca_documentos' WHERE id=$1`, [id]);
  return { id, lembrete: false };
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
