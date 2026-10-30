import type pg from 'pg';
import { z } from 'zod';
import { query, tx } from '../db';
import { chaveNormalizada } from '../chave';
import { Actor, AppError, exigirAdmin } from '../errors';
import { Core, Local } from '../pdf/core';
import { competenciaSchema } from './documentos';
import { obterEmpresa } from './empresas';
import { registrar } from './auditoria';
import { servePara, sugerirGenerico } from '../regras-generico';
import { PLANO_GENERICO } from '../plano-generico';
/** Categoria "Não sei identificar" (vai para a revisão do escritório e não ensina o sistema). */
export const CODIGO_NAO_SEI = PLANO_GENERICO.find((c) => c.referencia === 'OUT006')!.codigo;

type Runner = Pick<pg.PoolClient, 'query'>;
export { chaveNormalizada };

/* ================= Plano de contas do cliente (editado pelo escritório) ================= */
const contaSchema = z.object({
  codigo: z.coerce.number({ message: 'Informe o código.' }).int().min(1, 'Informe o código.'),
  classificacao: z.string().trim().regex(/^\d(\.\d{1,5}){0,6}$/, 'Classificação inválida (ex.: 3.1.2.01.0004).'),
  nome: z.string().trim().min(2, 'Informe o nome da conta.'),
});
export async function listarPlano(actor: Actor, empresaId: string, incluirInativas = false) {
  const e = await obterEmpresa(actor, empresaId);
  return (await query(`SELECT id,codigo,classificacao,nome,ativo,grupo,descricao,tipo,generico FROM plano_contas WHERE empresa_id=$1 ${incluirInativas ? '' : 'AND ativo'} ORDER BY generico DESC, codigo`, [e.id])).rows as
    { id: string; codigo: number; classificacao: string; nome: string; ativo: boolean; grupo: string | null; descricao: string | null; tipo: 'C' | 'D' | 'T' | 'CD' | null; generico: boolean }[];
}
export async function salvarContaPlano(actor: Actor, empresaId: string, input: z.input<typeof contaSchema>) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  const d = contaSchema.parse(input);
  await tx(async (c) => {
    const r = await c.query(
      `INSERT INTO plano_contas(empresa_id,codigo,classificacao,nome) VALUES ($1,$2,$3,$4)
       ON CONFLICT (empresa_id,codigo) DO UPDATE SET classificacao=EXCLUDED.classificacao, nome=EXCLUDED.nome RETURNING id, (xmax = 0) AS nova`, [empresaId, d.codigo, d.classificacao, d.nome]);
    await registrar(c, { usuarioId: actor.id, empresaId, acao: r.rows[0].nova ? 'plano.criar_conta' : 'plano.editar_conta', entidade: 'plano_conta', entidadeId: r.rows[0].id, detalhes: { codigo: d.codigo } });
  });
}
export async function definirContaPlanoAtiva(actor: Actor, id: string, ativo: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE plano_contas SET ativo=$2 WHERE id=$1 RETURNING empresa_id', [id, ativo]);
    if (!r.rowCount) throw new AppError('Conta não encontrada.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, empresaId: r.rows[0].empresa_id, acao: ativo ? 'plano.ativar_conta' : 'plano.desativar_conta', entidade: 'plano_conta', entidadeId: id });
  });
}
/** Importa o relatório "Relacionamento de contas com o plano referencial" do Domínio (texto colado) com o mesmo leitor do Conciliador. */
export async function importarPlano(actor: Actor, empresaId: string, texto: string) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  if (texto.length > 2_000_000) throw new AppError('Texto grande demais.');
  const contas: [number, string, string][] = Core.parsePlano(texto.split(/\r?\n/));
  const validas = contas.filter(([cod, cl, nome]) => cod > 0 && /^\d(\.\d{1,5}){0,6}$/.test(cl) && nome.length > 1);
  if (!validas.length) throw new AppError('Não encontrei contas no texto. Cole o relatório do plano de contas do Domínio (código, classificação e nome).');
  return tx(async (c) => {
    let novas = 0, atualizadas = 0;
    for (const [cod, cl, nome] of validas) {
      const r = await c.query(
        `INSERT INTO plano_contas(empresa_id,codigo,classificacao,nome) VALUES ($1,$2,$3,$4)
         ON CONFLICT (empresa_id,codigo) DO UPDATE SET classificacao=EXCLUDED.classificacao, nome=EXCLUDED.nome RETURNING (xmax = 0) AS nova`, [empresaId, cod, cl, nome.slice(0, 200)]);
      r.rows[0].nova ? novas++ : atualizadas++;
    }
    await registrar(c, { usuarioId: actor.id, empresaId, acao: 'plano.importar', entidade: 'plano_conta', detalhes: { novas, atualizadas } });
    return { lidas: validas.length, novas, atualizadas };
  });
}

/* ================= Motor de classificação (regras do Conciliador + aprendizado por cliente) ================= */
type LinhaMotor = { id: number; descricao: string; valor: number; chave: string; banco: string };
export async function classificarLinhasAutomatico(r: Runner, empresaId: string, linhas: LinhaMotor[]) {
  if (!linhas.length) return;
  const todas = (await r.query('SELECT codigo,classificacao,nome,tipo,generico FROM plano_contas WHERE empresa_id=$1 AND ativo', [empresaId])).rows as { codigo: number; classificacao: string; nome: string; tipo: string | null; generico: boolean }[];
  // com o plano genérico, as sugestões usam só as categorias que o cliente enxerga (o plano do Domínio fica para o escritório)
  const usarGenerico = todas.some((c) => c.generico);
  const visiveis = usarGenerico ? todas.filter((c) => c.generico) : todas;
  const tipoDe = new Map(todas.map((c) => [c.codigo, c.tipo]));
  const porCod = new Set(todas.map((c) => c.codigo));
  const plano = Local.prepararPlano(visiveis.map((c) => [c.codigo, c.classificacao, c.nome]), Core);
  const cnpj = usarGenerico ? (await r.query('SELECT cnpj FROM empresas WHERE id=$1', [empresaId])).rows[0]?.cnpj as string | undefined : undefined;
  const dic = new Map<string, number>((await r.query('SELECT chave,sentido,conta_codigo FROM dicionario_classificacao WHERE empresa_id=$1', [empresaId])).rows.map((x) => [`${x.chave}|${x.sentido}`, x.conta_codigo]));
  for (const l of linhas) {
    const sentido = l.valor > 0 ? 'C' : 'D';
    let conta: number | null = null, conf = 'B', motivo = '', origem = 'regra';
    const hit = l.chave ? dic.get(`${l.chave}|${sentido}`) : undefined;
    const sugestao = usarGenerico ? sugerirGenerico(l.descricao, l.valor, cnpj) : null;
    if (hit && porCod.has(hit)) { conta = hit; conf = 'A'; origem = 'historico'; motivo = 'Igual a lançamento já confirmado deste cliente.'; }
    else if (sugestao && porCod.has(sugestao.codigo)) { conta = sugestao.codigo; conf = sugestao.conf; motivo = sugestao.motivo; }
    else {
      let cl: { c?: number | null; n?: string; m?: string; r?: string };
      try { cl = Local.classificar({ historico: l.descricao, complemento: '', tipo: sentido, valor: Math.abs(l.valor) / 100, bn: l.banco }, plano, Core); }
      catch { cl = { c: null, n: 'B', r: 'Não foi possível classificar automaticamente.' }; }
      conf = ({ A: 'A', M: 'M', B: 'B' } as Record<string, string>)[cl.n ?? 'B'] ?? 'B';
      if (cl.c != null && porCod.has(cl.c) && servePara(tipoDe.get(cl.c), sentido)) conta = cl.c;
      else if (cl.c != null && porCod.has(cl.c)) { conf = 'B'; motivo = 'Sugestão descartada: a categoria não combina com ' + (sentido === 'C' ? 'uma entrada' : 'uma saída') + '. '; }
      else if (cl.c != null) { conf = 'B'; motivo = `O código ${cl.c} não existe no plano deste cliente. `; }
      if (conta == null && conf === 'A') conf = 'M';
      if (conta == null && usarGenerico) motivo = (motivo + 'Não reconheci este lançamento: escolha a categoria ou marque "Não sei identificar".').trim();
      else motivo += cl.m || cl.r || '';
    }
    await r.query('UPDATE movimentacoes SET conta_codigo=$2,confianca=$3,motivo=$4,origem=$5 WHERE id=$1 AND NOT revisado', [l.id, conta, conf, motivo.trim() || null, origem]);
  }
}
export async function classificarImportacao(r: Runner, empresaId: string, importacaoId: string) {
  const { rows } = await r.query(
    `SELECT m.id, m.descricao_original descricao, m.valor_centavos::text valor, m.chave_normalizada chave, cb.banco FROM movimentacoes m JOIN contas_bancarias cb ON cb.id=m.conta_id WHERE m.importacao_id=$1 ORDER BY m.id`, [importacaoId]);
  await classificarLinhasAutomatico(r, empresaId, rows.map((x) => ({ id: Number(x.id), descricao: x.descricao, valor: Number(x.valor), chave: x.chave, banco: x.banco })));
}
/** Reaplica as regras às linhas ainda NÃO revisadas (útil depois de editar o plano de contas). Linhas revisadas nunca mudam. */
export async function reclassificarNaoRevisadas(actor: Actor, empresaId: string) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  return tx(async (c) => {
    const { rows } = await c.query(
      `SELECT m.id, m.descricao_original descricao, m.valor_centavos::text valor, m.chave_normalizada chave, cb.banco FROM movimentacoes m JOIN contas_bancarias cb ON cb.id=m.conta_id WHERE m.empresa_id=$1 AND NOT m.revisado ORDER BY m.id`, [empresaId]);
    await classificarLinhasAutomatico(c, empresaId, rows.map((x) => ({ id: Number(x.id), descricao: x.descricao, valor: Number(x.valor), chave: x.chave, banco: x.banco })));
    await registrar(c, { usuarioId: actor.id, empresaId, acao: 'plano.reclassificar', entidade: 'empresa', entidadeId: empresaId, detalhes: { linhas: rows.length } });
    return rows.length;
  });
}

/* ================= Tela de conciliação ================= */
export type LinhaConciliacao = {
  id: number; data: string; descricao_original: string; valor: number; documento: string | null; banco: string; conta_bancaria_id: string;
  conta_codigo: number | null; conta_nome: string | null; classificacao: string | null; complemento: string | null;
  confianca: 'A' | 'M' | 'B'; motivo: string | null; observacao: string | null; origem: string; revisado: boolean; revisado_por: string | null;
  correcao_pedida: boolean; correcao_motivo: string | null; conta_grupo: string | null; nota_fiscal: string | null; sem_nota: boolean; chave: string | null;
};
export async function listarConciliacao(actor: Actor, empresaId: string, competencia: string): Promise<LinhaConciliacao[]> {
  const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  return (await query(
    `SELECT m.id,m.data::text data,m.descricao_original,m.valor_centavos::text valor,m.documento,cb.banco,cb.id conta_bancaria_id,m.conta_codigo,p.nome conta_nome,p.classificacao,
            m.complemento,m.confianca,m.motivo,m.observacao,m.origem,m.revisado,u.nome revisado_por,m.correcao_pedida,m.correcao_motivo,p.grupo conta_grupo,m.nota_fiscal,m.sem_nota,m.chave_normalizada chave
       FROM movimentacoes m JOIN contas_bancarias cb ON cb.id=m.conta_id
       LEFT JOIN plano_contas p ON p.empresa_id=m.empresa_id AND p.codigo=m.conta_codigo LEFT JOIN usuarios u ON u.id=m.revisado_por
      WHERE m.empresa_id=$1 AND m.competencia=$2 ORDER BY m.data, m.id`, [e.id, competencia])).rows.map((r) => ({ ...r, id: Number(r.id), valor: Number(r.valor) }));
}
export function resumoLinhas(ls: { confianca: string; revisado: boolean }[]) {
  return { linhas: ls.length, alta: ls.filter((l) => l.confianca === 'A').length, media: ls.filter((l) => l.confianca === 'M').length, baixa: ls.filter((l) => l.confianca === 'B').length, naoRev: ls.filter((l) => !l.revisado && l.confianca !== 'A').length };
}
export async function bancosConciliacao(actor: Actor, empresaId: string, competencia: string) {
  const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  return (await query(
    `SELECT i.id, cb.id conta_bancaria_id, cb.banco, cb.conta, i.nome_arquivo, i.resumo FROM importacoes i JOIN contas_bancarias cb ON cb.id=i.conta_id
      WHERE i.empresa_id=$1 AND i.competencia=$2 AND i.status='confirmada'
        AND EXISTS (SELECT 1 FROM movimentacoes m WHERE m.importacao_id=i.id) -- reenvio que não trouxe nada novo não aparece de novo
      ORDER BY i.confirmada_em`, [e.id, competencia])).rows;
}
export type StatusConc = 'revisao' | 'enviada' | 'devolvida' | 'concluida';
export type Conciliacao = { status: StatusConc; mensagem: string | null; enviadaEm: string | null; devolvidaEm: string | null; concluidaEm: string | null };
export async function obterConciliacao(actor: Actor, empresaId: string, competencia: string): Promise<Conciliacao> {
  const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  const r = (await query('SELECT status,mensagem,enviada_em,devolvida_em,concluida_em FROM conciliacoes WHERE empresa_id=$1 AND competencia=$2', [e.id, competencia])).rows[0];
  return { status: (r?.status ?? 'revisao') as StatusConc, mensagem: r?.mensagem ?? null, enviadaEm: r?.enviada_em ?? null, devolvidaEm: r?.devolvida_em ?? null, concluidaEm: r?.concluida_em ?? null };
}
export async function obterStatusConciliacao(actor: Actor, empresaId: string, competencia: string): Promise<StatusConc> { return (await obterConciliacao(actor, empresaId, competencia)).status; }

/** Cliente não altera a competência depois de enviada ou concluída; o escritório sempre pode. */
export async function exigirEditavel(actor: Actor, empresaId: string, competencia: string, r: Runner = { query } as Runner) {
  if (actor.papel !== 'cliente') return;
  const st = (await r.query('SELECT status FROM conciliacoes WHERE empresa_id=$1 AND competencia=$2', [empresaId, competencia])).rows[0]?.status;
  if (st === 'enviada' || st === 'concluida') throw new AppError(st === 'enviada' ? 'Esta competência foi enviada ao escritório e está aguardando conferência. Para alterar, aguarde a devolução.' : 'Esta competência já foi concluída pelo escritório e não pode mais ser alterada.');
}
async function travarConciliacao(c: Runner, empresaId: string, competencia: string) {
  await c.query('INSERT INTO conciliacoes(empresa_id,competencia) VALUES ($1,$2) ON CONFLICT DO NOTHING', [empresaId, competencia]);
  return (await c.query('SELECT status FROM conciliacoes WHERE empresa_id=$1 AND competencia=$2 FOR UPDATE', [empresaId, competencia])).rows[0].status as StatusConc;
}
/** Cliente conclui o preenchimento e envia ao escritório: exige movimentações, todas com conta, e sem correção pendente. */
export async function enviarParaConferencia(actor: Actor, empresaId: string, competencia: string) {
  const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  await tx(async (c) => {
    const st = await travarConciliacao(c, e.id, competencia);
    if (st !== 'revisao' && st !== 'devolvida') throw new AppError(st === 'enviada' ? 'Esta competência já foi enviada ao escritório.' : 'Esta competência já foi concluída.');
    const s = (await c.query(`SELECT count(*)::int total, count(*) FILTER (WHERE conta_codigo IS NULL)::int sem_conta, count(*) FILTER (WHERE correcao_pedida)::int correcoes,
        count(*) FILTER (WHERE nota_fiscal IS NULL AND NOT sem_nota)::int sem_nota_informada FROM movimentacoes WHERE empresa_id=$1 AND competencia=$2`, [e.id, competencia])).rows[0];
    if (!s.total) throw new AppError('Não há movimentações importadas nesta competência.');
    if (s.sem_conta) throw new AppError(`Ainda há ${s.sem_conta} movimentação(ões) sem conta contábil. Classifique todas antes de enviar.`);
    if (s.correcoes) throw new AppError(`Ainda há ${s.correcoes} movimentação(ões) com correção pedida pelo escritório. Ajuste-as antes de enviar de novo.`);
    if (s.sem_nota_informada) throw new AppError(`Falta informar a nota fiscal em ${s.sem_nota_informada} lançamento(s): digite o número da nota ou marque "Sem nota". Use o filtro "Falta nota" para encontrá-los.`);
    await c.query(`UPDATE conciliacoes SET status='enviada',enviada_em=now(),enviada_por=$3,mensagem=NULL,atualizado_por=$3,atualizado_em=now() WHERE empresa_id=$1 AND competencia=$2`, [e.id, competencia, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: e.id, acao: 'conciliacao.enviar', entidade: 'conciliacao', entidadeId: `${e.id}:${competencia}`, detalhes: { competencia, movimentacoes: s.total } });
  });
}
/** Escritório aponta as linhas que precisam de ajuste (com o motivo). */
export async function pedirCorrecao(actor: Actor, idsIn: number[], motivo: string) {
  exigirAdmin(actor);
  const m = z.string().trim().min(3, 'Informe o que precisa ser corrigido.').max(500).parse(motivo);
  const ls = await linhasAcessiveis(actor, idsIn);
  await tx(async (c) => {
    await c.query('UPDATE movimentacoes SET correcao_pedida=true,correcao_motivo=$2,correcao_por=$3,correcao_em=now() WHERE id=ANY($1)', [ls.map((l) => l.id), m, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: ls[0].empresaId, acao: 'conciliacao.pedir_correcao', entidade: 'movimentacao', entidadeId: String(ls[0].id), detalhes: { linhas: ls.length, motivo: m } });
  });
  return ls.length;
}
export async function limparCorrecao(actor: Actor, idsIn: number[]) {
  exigirAdmin(actor); const ls = await linhasAcessiveis(actor, idsIn);
  await tx(async (c) => {
    await c.query('UPDATE movimentacoes SET correcao_pedida=false,correcao_motivo=NULL WHERE id=ANY($1)', [ls.map((l) => l.id)]);
    await registrar(c, { usuarioId: actor.id, empresaId: ls[0].empresaId, acao: 'conciliacao.limpar_correcao', entidade: 'movimentacao', entidadeId: String(ls[0].id), detalhes: { linhas: ls.length } });
  });
}
/** Escritório devolve a competência ao cliente: precisa ter linhas marcadas ou uma mensagem. */
export async function devolverParaCorrecao(actor: Actor, empresaId: string, competencia: string, mensagem: string) {
  exigirAdmin(actor); const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  const msg = z.string().max(1000).parse(mensagem ?? '').trim();
  await tx(async (c) => {
    const st = await travarConciliacao(c, e.id, competencia);
    if (st !== 'enviada') throw new AppError('Só dá para devolver uma competência que o cliente enviou para conferência.');
    const n = (await c.query('SELECT count(*)::int n FROM movimentacoes WHERE empresa_id=$1 AND competencia=$2 AND correcao_pedida', [e.id, competencia])).rows[0].n;
    if (!n && !msg) throw new AppError('Marque as movimentações que precisam de ajuste ou escreva uma mensagem para o cliente.');
    await c.query(`UPDATE conciliacoes SET status='devolvida',devolvida_em=now(),mensagem=$3,atualizado_por=$4,atualizado_em=now() WHERE empresa_id=$1 AND competencia=$2`, [e.id, competencia, msg || null, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: e.id, acao: 'conciliacao.devolver', entidade: 'conciliacao', entidadeId: `${e.id}:${competencia}`, detalhes: { competencia, linhas: n, mensagem: msg } });
  });
}
export async function concluirConciliacao(actor: Actor, empresaId: string, competencia: string) {
  exigirAdmin(actor); const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  await tx(async (c) => {
    const st = await travarConciliacao(c, e.id, competencia);
    if (st !== 'enviada') throw new AppError('Só dá para concluir uma competência enviada pelo cliente.');
    const n = (await c.query('SELECT count(*)::int n FROM movimentacoes WHERE empresa_id=$1 AND competencia=$2 AND (correcao_pedida OR conta_codigo IS NULL)', [e.id, competencia])).rows[0].n;
    if (n) throw new AppError(`Há ${n} movimentação(ões) sem conta ou com correção pedida. Resolva antes de concluir.`);
    await c.query(`UPDATE conciliacoes SET status='concluida',concluida_em=now(),atualizado_por=$3,atualizado_em=now() WHERE empresa_id=$1 AND competencia=$2`, [e.id, competencia, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: e.id, acao: 'conciliacao.concluir', entidade: 'conciliacao', entidadeId: `${e.id}:${competencia}`, detalhes: { competencia } });
  });
}
export async function reabrirConciliacao(actor: Actor, empresaId: string, competencia: string) {
  exigirAdmin(actor); const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  await tx(async (c) => {
    const st = await travarConciliacao(c, e.id, competencia);
    if (st === 'revisao') throw new AppError('Esta competência já está aberta para o cliente.');
    await c.query(`UPDATE conciliacoes SET status='revisao',mensagem=NULL,atualizado_por=$3,atualizado_em=now() WHERE empresa_id=$1 AND competencia=$2`, [e.id, competencia, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: e.id, acao: 'conciliacao.reabrir', entidade: 'conciliacao', entidadeId: `${e.id}:${competencia}`, detalhes: { competencia, de: st } });
  });
}

/** Conferência de saldos por conta (só afirma "confere" quando há saldo inicial e final no arquivo; senão: sem dados). */
export type SaldoConta = { contaId: string; banco: string; conta: string | null; lancamentos: number; entradas: number; saidas: number; saldoInicial: number | null; saldoCalculado: number | null; saldoFinalExtrato: number | null; confere: boolean | null; diferenca: number | null };
export async function conferenciaSaldos(actor: Actor, empresaId: string, competencia: string): Promise<SaldoConta[]> {
  const e = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  const somas = (await query(
    `SELECT cb.id, cb.banco, cb.conta, count(m.id)::int n, coalesce(sum(m.valor_centavos) FILTER (WHERE m.valor_centavos>0),0)::text ent, coalesce(sum(m.valor_centavos) FILTER (WHERE m.valor_centavos<0),0)::text sai
       FROM contas_bancarias cb JOIN movimentacoes m ON m.conta_id=cb.id AND m.competencia=$2 WHERE cb.empresa_id=$1 GROUP BY cb.id ORDER BY cb.banco, cb.conta`, [e.id, competencia])).rows;
  const imps = (await query(`SELECT conta_id, resumo FROM importacoes WHERE empresa_id=$1 AND competencia=$2 AND status='confirmada' ORDER BY resumo->'periodo'->>0, criado_em`, [e.id, competencia])).rows;
  return somas.map((s) => {
    const mine = imps.filter((i) => i.conta_id === s.id).map((i) => i.resumo as { saldoFinalInformado?: number | null; conferenciaSaldo?: { saldoAnterior: number | null; saldoFinalInformado: number | null } | null });
    const ini = mine.find((r) => r.conferenciaSaldo?.saldoAnterior != null)?.conferenciaSaldo?.saldoAnterior ?? null;
    const ultimo = [...mine].reverse().find((r) => r.conferenciaSaldo?.saldoFinalInformado != null || r.saldoFinalInformado != null);
    const fim = ultimo ? (ultimo.conferenciaSaldo?.saldoFinalInformado ?? ultimo.saldoFinalInformado ?? null) : null;
    const entradas = Number(s.ent), saidas = Number(s.sai);
    const calc = ini != null ? ini + entradas + saidas : null;
    const confere = calc != null && fim != null ? calc === fim : null;
    return { contaId: s.id, banco: s.banco, conta: s.conta, lancamentos: s.n, entradas, saidas, saldoInicial: ini, saldoCalculado: calc, saldoFinalExtrato: fim, confere, diferenca: calc != null && fim != null ? calc - fim : null };
  });
}

/** Fila do escritório: situação de todas as empresas ativas na competência. */
export async function listarConciliacoesEscritorio(actor: Actor, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  return (await query(
    `SELECT e.id, e.razao_social, coalesce(c.status,'revisao') status, c.enviada_em,
            count(m.id)::int linhas, count(m.id) FILTER (WHERE m.conta_codigo IS NULL)::int sem_conta,
            count(m.id) FILTER (WHERE NOT m.revisado AND m.confianca<>'A')::int nao_rev, count(m.id) FILTER (WHERE m.correcao_pedida)::int correcoes
       FROM empresas e LEFT JOIN conciliacoes c ON c.empresa_id=e.id AND c.competencia=$1 LEFT JOIN movimentacoes m ON m.empresa_id=e.id AND m.competencia=$1
      WHERE e.situacao='ativa' GROUP BY e.id, c.status, c.enviada_em
      ORDER BY (coalesce(c.status,'revisao')='enviada') DESC, (count(m.id)=0), e.razao_social`, [competencia])).rows as
    { id: string; razao_social: string; status: StatusConc; enviada_em: string | null; linhas: number; sem_conta: number; nao_rev: number; correcoes: number }[];
}

/* ---------- edição de linhas ---------- */
const ids = z.array(z.number().int().positive()).min(1).max(5000);
async function linhasAcessiveis(actor: Actor, idsIn: number[], opts: { paraEditar?: boolean } = {}) {
  const lista = ids.parse([...new Set(idsIn)]);
  const { rows } = await query('SELECT id,empresa_id,competencia,valor_centavos::text valor,chave_normalizada chave,conta_codigo FROM movimentacoes WHERE id = ANY($1)', [lista]);
  if (rows.length !== lista.length) throw new AppError('Movimentação não encontrada.', 'nao_encontrado');
  if (opts.paraEditar) for (const k of new Set(rows.map((r) => `${r.empresa_id}|${r.competencia}`))) { const [emp, comp] = k.split('|'); await obterEmpresa(actor, emp); await exigirEditavel(actor, emp, comp); }
  for (const emp of new Set(rows.map((r) => r.empresa_id as string))) await obterEmpresa(actor, emp); // mesma regra de acesso da empresa
  return rows.map((r) => ({ id: Number(r.id), competencia: r.competencia as string, empresaId: r.empresa_id as string, valor: Number(r.valor), chave: r.chave as string, conta: r.conta_codigo as number | null }));
}
async function aprender(c: Runner, empresaId: string, chave: string, valor: number, conta: number) {
  if (!chave || conta === CODIGO_NAO_SEI) return; // "Não sei identificar" não vira regra para os próximos meses
  await c.query(
    `INSERT INTO dicionario_classificacao(empresa_id,chave,sentido,conta_codigo) VALUES ($1,$2,$3,$4)
     ON CONFLICT (empresa_id,chave,sentido) DO UPDATE SET conta_codigo=EXCLUDED.conta_codigo, vezes=dicionario_classificacao.vezes+1, atualizado_em=now()`, [empresaId, chave, valor > 0 ? 'C' : 'D', conta]);
}
/** Escolher a conta (uma linha ou várias de uma vez). Conta humana = confiança Alta, revisada, e vira regra deste cliente. */
export async function classificarEmLote(actor: Actor, idsIn: number[], contaCodigo: number) {
  const ls = await linhasAcessiveis(actor, idsIn, { paraEditar: true });
  await tx(async (c) => {
    for (const emp of new Set(ls.map((l) => l.empresaId))) {
      if (!(await c.query('SELECT 1 FROM plano_contas WHERE empresa_id=$1 AND codigo=$2 AND ativo', [emp, contaCodigo])).rowCount) throw new AppError('Essa conta não existe no plano deste cliente.');
    }
    for (const l of ls) {
      await c.query(`UPDATE movimentacoes SET conta_codigo=$2,confianca='A',origem='manual',motivo=NULL,revisado=true,revisado_por=$3,revisado_em=now(),classificado_por=$3,classificado_em=now() WHERE id=$1`, [l.id, contaCodigo, actor.id]);
      await aprender(c, l.empresaId, l.chave, l.valor, contaCodigo);
    }
    if (actor.papel === 'cliente') await c.query('UPDATE movimentacoes SET correcao_pedida=false WHERE id=ANY($1)', [ls.map((l) => l.id)]);
    await registrar(c, { usuarioId: actor.id, empresaId: ls[0].empresaId, acao: 'conciliacao.classificar', entidade: 'movimentacao', entidadeId: String(ls[0].id), detalhes: { linhas: ls.length, conta: contaCodigo } });
  });
  return ls.length;
}
/** Botão OK: confirma a classificação sugerida (exige conta) e ensina o sistema. */
export async function confirmarLinhas(actor: Actor, idsIn: number[]) {
  const ls = await linhasAcessiveis(actor, idsIn, { paraEditar: true });
  if (ls.some((l) => l.conta == null)) throw new AppError('Escolha uma conta antes de confirmar.');
  await tx(async (c) => {
    for (const l of ls) {
      await c.query(`UPDATE movimentacoes SET confianca='A',revisado=true,revisado_por=$2,revisado_em=now() WHERE id=$1`, [l.id, actor.id]);
      await aprender(c, l.empresaId, l.chave, l.valor, l.conta!);
    }
    if (actor.papel === 'cliente') await c.query('UPDATE movimentacoes SET correcao_pedida=false WHERE id=ANY($1)', [ls.map((l) => l.id)]);
    await registrar(c, { usuarioId: actor.id, empresaId: ls[0].empresaId, acao: 'conciliacao.confirmar', entidade: 'movimentacao', entidadeId: String(ls[0].id), detalhes: { linhas: ls.length } });
  });
  return ls.length;
}
/** Editor da linha: complemento e observação (e, se informada, a conta). */
const notaSchema = z.string().trim().max(60, 'Número da nota muito longo.').regex(/^[\w./ -]*$/, 'Use só números, letras, ponto, barra ou hífen no número da nota.');
export async function editarLinha(actor: Actor, id: number, input: { contaCodigo?: number | null; complemento?: string; observacao?: string; notaFiscal?: string; semNota?: boolean }) {
  const d = z.object({ contaCodigo: z.number().int().positive().nullish(), complemento: z.string().max(300).optional(), observacao: z.string().max(1000).optional(), notaFiscal: notaSchema.optional(), semNota: z.boolean().optional() }).parse(input);
  const [l] = await linhasAcessiveis(actor, [id], { paraEditar: true });
  await tx(async (c) => {
    await c.query('UPDATE movimentacoes SET complemento=$2, observacao=$3 WHERE id=$1', [id, d.complemento?.trim() || null, d.observacao?.trim() || null]);
    if (d.notaFiscal !== undefined || d.semNota !== undefined) {
      const nota = d.semNota ? null : d.notaFiscal || null; // número informado tira o "sem nota"; "sem nota" apaga o número
      await c.query('UPDATE movimentacoes SET nota_fiscal=$2, sem_nota=$3 WHERE id=$1', [id, nota, !!d.semNota && !nota]);
    }
    if (actor.papel === 'cliente') await c.query('UPDATE movimentacoes SET correcao_pedida=false WHERE id=$1', [id]);
    await registrar(c, { usuarioId: actor.id, empresaId: l.empresaId, acao: 'conciliacao.editar', entidade: 'movimentacao', entidadeId: String(id) });
  });
  if (d.contaCodigo && d.contaCodigo !== l.conta) await classificarEmLote(actor, [id], d.contaCodigo);
}

/* ================= Plano genérico de categorias (todas as empresas) ================= */
/** Garante o plano genérico na(s) empresa(s): insere as categorias que faltarem, sem mexer nas existentes nem no plano do Domínio. */
export async function garantirPlanoGenerico(r: Runner, empresaId?: string) {
  const { PLANO_GENERICO } = await import('../plano-generico');
  const empresas = empresaId ? [empresaId] : (await r.query('SELECT id FROM empresas')).rows.map((x) => x.id as string);
  const col = (k: keyof (typeof PLANO_GENERICO)[number]) => PLANO_GENERICO.map((c) => c[k]);
  for (const e of empresas) {
    await r.query(
      `INSERT INTO plano_contas(empresa_id,codigo,classificacao,nome,grupo,descricao,tipo,generico)
       SELECT $1, * , true FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
       ON CONFLICT (empresa_id,codigo) DO NOTHING`,
      [e, col('codigo'), col('classificacao'), col('nome'), col('grupo'), col('descricao'), col('tipo')]);
  }
  return empresas.length;
}

/** Marca vários lançamentos como "sem nota" de uma vez (o número, se houver, é apagado). */
export async function marcarSemNota(actor: Actor, idsIn: number[]) {
  const ls = await linhasAcessiveis(actor, idsIn, { paraEditar: true });
  await tx(async (c) => {
    await c.query('UPDATE movimentacoes SET nota_fiscal=NULL, sem_nota=true WHERE id = ANY($1)', [ls.map((l) => l.id)]);
    for (const emp of new Set(ls.map((l) => l.empresaId))) await registrar(c, { usuarioId: actor.id, empresaId: emp, acao: 'conciliacao.sem_nota', entidade: 'movimentacao', detalhes: { linhas: ls.filter((l) => l.empresaId === emp).length } });
  });
  return ls.length;
}
