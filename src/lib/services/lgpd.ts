import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { apagar } from '../storage';
import { registrar } from './auditoria';

/** Prazo de guarda (anos). O PRAZO CERTO É DEFINIÇÃO DO ESCRITÓRIO (controlador) com seu jurídico/encarregado; o padrão (5) é só um ponto de partida. */
export const anosRetencao = () => { const n = Number(process.env.RETENCAO_ANOS ?? 5); return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 5; };
// vencido = o fim do período a que o arquivo se refere (último dia do mês da competência / 31-12 do ano-calendário) já passou há mais de N anos
const VENCIDOS_ARQ = `a.descartado_em IS NULL AND (date_trunc('month', to_date(a.competencia || '-01','YYYY-MM-DD')) + interval '1 month') < (now() - make_interval(years => $1))`;
const VENCIDOS_AVU = `d.descartado_em IS NULL AND d.removido_em IS NULL AND (date_trunc('month', to_date(d.competencia || '-01','YYYY-MM-DD')) + interval '1 month') < (now() - make_interval(years => $1))`;
const VENCIDOS_INF = `v.descartado_em IS NULL AND make_date(i.ano_calendario + 1, 1, 1) < (now() - make_interval(years => $1))`;

export async function relatorioRetencao(actor: Actor) {
  exigirAdmin(actor); const n = anosRetencao();
  const a = (await query(`SELECT sum(qtd)::int qtd, coalesce(sum(bytes),0)::text bytes FROM (
      SELECT count(*) qtd, coalesce(sum(a.tamanho),0) bytes FROM arquivos a WHERE ${VENCIDOS_ARQ}
      UNION ALL SELECT count(*), coalesce(sum(d.tamanho),0) FROM documentos_avulsos d WHERE ${VENCIDOS_AVU}) t`, [n])).rows[0];
  const i = (await query(`SELECT count(*)::int qtd, coalesce(sum(v.tamanho),0)::text bytes FROM informe_versoes v JOIN informes i ON i.id=v.informe_id WHERE ${VENCIDOS_INF}`, [n])).rows[0];
  const d = (await query(`SELECT (SELECT count(*) FROM arquivos WHERE descartado_em IS NOT NULL)::int + (SELECT count(*) FROM documentos_avulsos WHERE descartado_em IS NOT NULL)::int + (SELECT count(*) FROM informe_versoes WHERE descartado_em IS NOT NULL)::int AS n`)).rows[0].n as number;
  return { anos: n, documentos: { qtd: a.qtd as number, bytes: Number(a.bytes) }, informes: { qtd: i.qtd as number, bytes: Number(i.bytes) }, jaDescartados: d };
}
/** Apaga o CONTEÚDO dos arquivos vencidos (some do disco). Metadados e auditoria ficam. Exige digitar DESCARTAR. */
export async function descartarVencidos(actor: Actor, confirmacao: string) {
  exigirAdmin(actor);
  if (confirmacao.trim() !== 'DESCARTAR') throw new AppError('Para confirmar, digite DESCARTAR.');
  const n = anosRetencao();
  const arq = (await query(`SELECT a.id, a.chave_storage FROM arquivos a WHERE ${VENCIDOS_ARQ}`, [n])).rows;
  const avu = (await query(`SELECT d.id, d.chave_storage FROM documentos_avulsos d WHERE ${VENCIDOS_AVU}`, [n])).rows;
  const inf = (await query(`SELECT v.id, v.chave_storage FROM informe_versoes v JOIN informes i ON i.id=v.informe_id WHERE ${VENCIDOS_INF}`, [n])).rows;
  for (const r of [...arq, ...avu, ...inf]) await apagar(r.chave_storage);
  await tx(async (c) => {
    if (arq.length) await c.query('UPDATE arquivos SET descartado_em=now() WHERE id = ANY($1)', [arq.map((r) => r.id)]);
    if (avu.length) await c.query('UPDATE documentos_avulsos SET descartado_em=now() WHERE id = ANY($1)', [avu.map((r) => r.id)]);
    if (inf.length) await c.query('UPDATE informe_versoes SET descartado_em=now() WHERE id = ANY($1)', [inf.map((r) => r.id)]);
    await registrar(c, { usuarioId: actor.id, acao: 'lgpd.descartar_vencidos', entidade: 'retencao', detalhes: { anos: n, documentos: arq.length + avu.length, informes: inf.length } });
  });
  return { documentos: arq.length + avu.length, informes: inf.length };
}

/** Cópia dos dados pessoais de um usuário (direito de acesso do titular). Nunca inclui hash de senha, segredo de 2FA nem códigos de recuperação. */
export async function exportarDadosUsuario(actor: Actor, usuarioId: string) {
  exigirAdmin(actor);
  if (!z.string().uuid().safeParse(usuarioId).success) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
  const u = (await query(`SELECT id,nome,email,papel,ativo,receber_emails,mfa_ativo,criado_em,atualizado_em FROM usuarios WHERE id=$1`, [usuarioId])).rows[0];
  if (!u) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
  const q = async (sql: string) => (await query(sql, [usuarioId])).rows;
  const dados = {
    geradoEm: new Date().toISOString(), usuario: u,
    empresas: await q(`SELECT e.razao_social,e.cnpj,ue.criado_em vinculado_em FROM usuario_empresas ue JOIN empresas e ON e.id=ue.empresa_id WHERE ue.usuario_id=$1`),
    sociosAutorizados: await q(`SELECT s.nome socio,e.razao_social empresa,su.criado_em FROM socio_usuarios su JOIN socios s ON s.id=su.socio_id JOIN empresas e ON e.id=s.empresa_id WHERE su.usuario_id=$1`),
    arquivosEnviados: await q(`SELECT nome_original,competencia,enviado_em FROM arquivos WHERE enviado_por=$1 ORDER BY enviado_em DESC LIMIT 1000`),
    retiradasLancadas: await q(`SELECT competencia,data,socio_nome,tipo,valor,criado_em,removido_em FROM retiradas WHERE criado_por=$1 ORDER BY criado_em DESC LIMIT 1000`),
    outrosDocumentosEnviados: await q(`SELECT nome_original,descricao,competencia,enviado_em,removido_em FROM documentos_avulsos WHERE enviado_por=$1 ORDER BY enviado_em DESC LIMIT 1000`),
    extratosImportados: await q(`SELECT nome_arquivo,competencia,status,criado_em FROM importacoes WHERE criado_por=$1 ORDER BY criado_em DESC LIMIT 1000`),
    informesBaixados: await q(`SELECT a.criado_em,i.ano_calendario FROM informe_acessos a JOIN informes i ON i.id=a.informe_id WHERE a.usuario_id=$1 ORDER BY a.id DESC LIMIT 1000`),
    mensagensEmPendencias: await q(`SELECT texto,criado_em FROM pendencia_mensagens WHERE usuario_id=$1 ORDER BY id DESC LIMIT 1000`),
    registroDeAcoes: await q(`SELECT criado_em,acao,entidade FROM auditoria WHERE usuario_id=$1 ORDER BY id DESC LIMIT 1000`),
  };
  await tx(async (c) => registrar(c, { usuarioId: actor.id, acao: 'lgpd.exportar_usuario', entidade: 'usuario', entidadeId: usuarioId }));
  return dados;
}
/** Remove a identificação da pessoa (nome, e-mail, acesso, 2FA, vínculos) mantendo o ID para a trilha de auditoria continuar íntegra. Irreversível. */
export async function anonimizarUsuario(actor: Actor, usuarioId: string, confirmacao: string) {
  exigirAdmin(actor);
  if (confirmacao.trim() !== 'ANONIMIZAR') throw new AppError('Para confirmar, digite ANONIMIZAR.');
  if (actor.id === usuarioId) throw new AppError('Você não pode anonimizar a própria conta.');
  const hash = await bcrypt.hash(randomBytes(32).toString('hex'), process.env.NODE_ENV === 'test' ? 4 : 12);
  await tx(async (c) => {
    const u = (await c.query('SELECT papel,ativo FROM usuarios WHERE id=$1 FOR UPDATE', [usuarioId])).rows[0];
    if (!u) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
    if (u.papel === 'admin' && u.ativo && (await c.query(`SELECT count(*)::int n FROM usuarios WHERE papel='admin' AND ativo AND id<>$1`, [usuarioId])).rows[0].n === 0) throw new AppError('É o único administrador ativo; crie outro antes.');
    await c.query(`UPDATE usuarios SET nome='Usuário removido', email=$2, senha_hash=$3, ativo=false, receber_emails=false, mfa_ativo=false, mfa_segredo=NULL, mfa_ultimo_passo=NULL, deve_trocar_senha=true, token_version=token_version+1, atualizado_em=now() WHERE id=$1`, [usuarioId, `removido-${randomUUID().slice(0, 8)}@anonimizado.invalid`, hash]);
    await c.query('DELETE FROM usuario_empresas WHERE usuario_id=$1', [usuarioId]); await c.query('DELETE FROM socio_usuarios WHERE usuario_id=$1', [usuarioId]); await c.query('DELETE FROM mfa_recuperacao WHERE usuario_id=$1', [usuarioId]);
    await c.query(`UPDATE notificacoes SET status='cancelada' WHERE destinatario_id=$1 AND status IN ('pendente','falha')`, [usuarioId]);
    await registrar(c, { usuarioId: actor.id, acao: 'lgpd.anonimizar_usuario', entidade: 'usuario', entidadeId: usuarioId });
  });
}
