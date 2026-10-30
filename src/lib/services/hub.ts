import { query } from '../db';
import { Actor, exigirAdmin } from '../errors';
import { competenciaSchema, situacaoCompetencia, visaoGeral } from './documentos';
import { obterStatusConciliacao } from './conciliacao';
import { resumoPendencias } from './pendencias';
import { obterEmpresa } from './empresas';

/** Números da tela inicial do escritório: só o que pede atenção. */
export async function resumoEscritorio(actor: Actor, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  const [v, n] = await Promise.all([visaoGeral(actor, competencia), query(
    `SELECT (SELECT count(*) FROM empresas WHERE situacao='ativa')::int empresas,
            (SELECT count(*) FROM conciliacoes c JOIN empresas e ON e.id=c.empresa_id AND e.situacao='ativa' WHERE c.competencia=$1 AND c.status='enviada')::int conciliacoes,
            (SELECT count(*) FROM pendencias p JOIN empresas e ON e.id=p.empresa_id AND e.situacao='ativa' WHERE p.situacao='respondida')::int pendencias,
            (SELECT count(*) FROM documentos_avulsos d JOIN empresas e ON e.id=d.empresa_id AND e.situacao='ativa' WHERE d.visto_em IS NULL AND d.removido_em IS NULL AND d.descartado_em IS NULL)::int pdfs_novos,
            (SELECT count(*) FROM retiradas_envios r JOIN empresas e ON e.id=r.empresa_id AND e.situacao='ativa' WHERE r.competencia=$1)::int retiradas,
            (SELECT count(*) FROM usuarios WHERE ativo)::int usuarios,
            (SELECT count(*) FROM arquivos a JOIN empresas e ON e.id=a.empresa_id AND e.situacao='ativa' WHERE a.competencia=$1 AND a.situacao IN ('enviado','em_conferencia'))::int a_conferir`, [competencia])]);
  const r = n.rows[0];
  return { ...r, entregasConcluidas: v.filter((e) => e.concluida).length } as
    { empresas: number; conciliacoes: number; pendencias: number; pdfs_novos: number; retiradas: number; usuarios: number; a_conferir: number; entregasConcluidas: number };
}

/** Situação de cada área para a tela inicial do cliente. */
export async function resumoCliente(actor: Actor, empresaId: string, competencia: string) {
  const e = await obterEmpresa(actor, empresaId);
  const [docs, conc, pend, ret, avulsos] = await Promise.all([
    situacaoCompetencia(actor, empresaId, competencia), obterStatusConciliacao(actor, empresaId, competencia), resumoPendencias(actor, empresaId),
    query('SELECT sem_retiradas FROM retiradas_envios WHERE empresa_id=$1 AND competencia=$2', [e.id, competencia]),
    query('SELECT count(*)::int n FROM documentos_avulsos WHERE empresa_id=$1 AND competencia=$2 AND removido_em IS NULL', [e.id, competencia]),
  ]);
  const movs = (await query('SELECT count(*)::int n FROM movimentacoes WHERE empresa_id=$1 AND competencia=$2', [e.id, competencia])).rows[0].n as number;
  return { empresa: e, docs: docs.indicadores, conciliacao: conc, movimentacoes: movs, pendencias: pend, retiradas: ret.rows[0] as { sem_retiradas: boolean } | undefined, pdfs: avulsos.rows[0].n as number };
}
