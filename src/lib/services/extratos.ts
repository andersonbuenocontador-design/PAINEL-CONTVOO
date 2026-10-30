import { createHash } from 'node:crypto';
import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { ExtratoIlegivel, lerExtrato, type Movimento } from '../extrato-parser';
import { competenciaSchema, TAMANHO_MAX } from './documentos';
import { obterEmpresa } from './empresas';
import { registrar } from './auditoria';


import { chaveNormalizada } from '../chave';
import { classificarImportacao, exigirEditavel } from './conciliacao';
export { chaveNormalizada };
const vazio = (s?: string | null) => (s && s.trim() ? s.trim() : null);

/* ---------- Contas bancárias ---------- */
const contaSchema = z.object({
  banco: z.string().trim().min(1, 'Informe o banco.'),
  apelido: z.string().optional().transform(vazio),
  agencia: z.string().optional().transform(vazio),
  conta: z.string().optional().transform(vazio),
});
export async function criarConta(actor: Actor, empresaId: string, input: z.input<typeof contaSchema>) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  const d = contaSchema.parse(input);
  return tx(async (c) => {
    try {
      const r = await c.query('INSERT INTO contas_bancarias(empresa_id,banco,apelido,agencia,conta) VALUES ($1,$2,$3,$4,$5) RETURNING id', [empresaId, d.banco, d.apelido, d.agencia, d.conta]);
      await registrar(c, { usuarioId: actor.id, empresaId, acao: 'conta.criar', entidade: 'conta', entidadeId: r.rows[0].id });
      return r.rows[0].id as string;
    } catch (e: any) { if (e.code === '23505') throw new AppError('Essa conta já está cadastrada para a empresa.', 'conflito'); throw e; }
  });
}
export async function definirContaAtiva(actor: Actor, id: string, ativo: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE contas_bancarias SET ativo=$2 WHERE id=$1 RETURNING empresa_id', [id, ativo]);
    if (!r.rowCount) throw new AppError('Conta não encontrada.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, empresaId: r.rows[0].empresa_id, acao: ativo ? 'conta.ativar' : 'conta.desativar', entidade: 'conta', entidadeId: id });
  });
}
export async function listarContas(actor: Actor, empresaId: string, apenasAtivas = false) {
  const e = await obterEmpresa(actor, empresaId);
  return (await query(`SELECT id,banco,apelido,agencia,conta,ativo FROM contas_bancarias WHERE empresa_id=$1 ${apenasAtivas ? 'AND ativo' : ''} ORDER BY ativo DESC, banco, conta`, [e.id])).rows;
}

/** "Detectar pelo extrato": usa a conta da empresa com o mesmo número (e banco); se não houver, cadastra com o que o extrato informa. */
const digitos = (v?: string | null) => (v ?? '').replace(/\D/g, '').replace(/^0+/, '');
export async function contaDoExtrato(actor: Actor, empresaId: string, info?: { banco?: string; agencia?: string; conta?: string }) {
  await obterEmpresa(actor, empresaId); // cliente só na própria empresa
  const banco = (info?.banco && info.banco !== 'BANCO' ? info.banco : '').trim();
  const numero = digitos(info?.conta);
  const contas = (await query('SELECT id,banco,conta,ativo FROM contas_bancarias WHERE empresa_id=$1', [empresaId])).rows as { id: string; banco: string; conta: string | null; ativo: boolean }[];
  const igual = (c: { banco: string; conta: string | null }) => numero && digitos(c.conta) === numero && (!banco || !c.banco || c.banco.toUpperCase().includes(banco.toUpperCase()) || banco.toUpperCase().includes(c.banco.toUpperCase()));
  const achada = contas.find((c) => c.ativo && igual(c)) ?? contas.find(igual);
  if (achada) { if (!achada.ativo) throw new AppError(`A conta ${achada.banco} ${achada.conta ?? ''} está desativada. Fale com o escritório.`); return achada.id; }
  if (!numero) {
    const ativas = contas.filter((c) => c.ativo);
    if (ativas.length === 1) return ativas[0].id;
    throw new AppError('Não consegui identificar a conta pelo extrato. Escolha a conta na lista (ou peça ao escritório para cadastrá-la).');
  }
  return tx(async (c) => {
    const r = await c.query('INSERT INTO contas_bancarias(empresa_id,banco,agencia,conta) VALUES ($1,$2,$3,$4) RETURNING id', [empresaId, banco || 'Banco não identificado', info?.agencia || null, info?.conta || null]);
    await registrar(c, { usuarioId: actor.id, empresaId, acao: 'conta.criar_pelo_extrato', entidade: 'conta', entidadeId: r.rows[0].id, detalhes: { banco: banco || null } });
    return r.rows[0].id as string;
  });
}

/* ---------- Importação com prévia ---------- */
export type LinhaPrevia = Movimento & { duplicada: 'certa' | 'possivel' | null; foraPeriodo: boolean };

const mesDe = (comp: string) => comp;
export async function criarPrevia(actor: Actor, p: { empresaId: string; contaId: string; competencia: string; nome: string; dados: Buffer }) {
  const emp = await obterEmpresa(actor, p.empresaId);
  competenciaSchema.parse(p.competencia);
  await exigirEditavel(actor, emp.id, p.competencia);
  if (p.contaId && !(await query('SELECT 1 FROM contas_bancarias WHERE id=$1 AND empresa_id=$2 AND ativo', [p.contaId, emp.id])).rowCount) throw new AppError('Conta bancária não encontrada.', 'nao_encontrado');
  if (!p.dados.length) throw new AppError('O arquivo está vazio.');
  if (p.dados.length > TAMANHO_MAX) throw new AppError('Arquivo maior que 20 MB.');
  let ex;
  try { ex = await lerExtrato(p.nome, p.dados); } catch (e) { if (e instanceof ExtratoIlegivel) throw new AppError(e.message); throw e; }
  const conta = { id: p.contaId || await contaDoExtrato(actor, emp.id, ex.conta) };

  const ids = ex.movimentos.map((m) => m.idExterno).filter((x): x is string => !!x);
  const jaId = new Set(ids.length ? (await query('SELECT id_externo FROM movimentacoes WHERE conta_id=$1 AND id_externo = ANY($2)', [conta.id, ids])).rows.map((r) => r.id_externo) : []);
  const datas = ex.movimentos.map((m) => m.data).sort();
  const existentes = datas.length ? (await query(
    `SELECT data::text d, valor_centavos::text v, descricao_original t FROM movimentacoes WHERE conta_id=$1 AND data BETWEEN $2 AND $3`, [conta.id, datas[0], datas[datas.length - 1]])).rows : [];
  const setPossivel = new Set(existentes.map((r) => `${r.d}|${r.v}|${r.t}`));

  const linhas: LinhaPrevia[] = ex.movimentos.map((m) => ({
    ...m,
    foraPeriodo: mesDe(m.data.slice(0, 7)) !== p.competencia,
    duplicada: m.idExterno ? (jaId.has(m.idExterno) ? 'certa' : null) : setPossivel.has(`${m.data}|${m.valor}|${m.descricao}`) ? 'possivel' : null,
  }));
  const sha = createHash('sha256').update(p.dados).digest('hex');
  const arquivoRepetido = (await query(`SELECT 1 FROM importacoes WHERE conta_id=$1 AND sha256=$2 AND status='confirmada' LIMIT 1`, [conta.id, sha])).rowCount! > 0;
  const novas = linhas.filter((l) => !l.duplicada && !l.foraPeriodo);
  const resumo = {
    registros: linhas.length, entradas: linhas.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0), saidas: linhas.filter((l) => l.valor < 0).reduce((a, l) => a + l.valor, 0),
    periodo: datas.length ? [datas[0], datas[datas.length - 1]] : null, incompletos: ex.erros.length, erros: ex.erros.slice(0, 20),
    duplicadasCertas: linhas.filter((l) => l.duplicada === 'certa').length, duplicadasPossiveis: linhas.filter((l) => l.duplicada === 'possivel').length,
    foraPeriodo: linhas.filter((l) => l.foraPeriodo).length, aImportar: novas.length, saldoFinalInformado: ex.saldoFinalInformado ?? null, conferenciaSaldo: ex.conferenciaSaldo ?? null, arquivoRepetido,
  };
  return tx(async (c) => {
    const r = await c.query(
      `INSERT INTO importacoes(empresa_id,conta_id,competencia,nome_arquivo,formato,sha256,dados,resumo,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [emp.id, conta.id, p.competencia, p.nome.slice(-180), ex.formato, sha, JSON.stringify(linhas), JSON.stringify(resumo), actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: emp.id, acao: 'importacao.previa', entidade: 'importacao', entidadeId: r.rows[0].id, detalhes: { registros: linhas.length } });
    return r.rows[0].id as string;
  });
}

async function carregarImportacao(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError('Importação não encontrada.', 'nao_encontrado');
  const i = (await query('SELECT * FROM importacoes WHERE id=$1', [id])).rows[0];
  if (!i) throw new AppError('Importação não encontrada.', 'nao_encontrado');
  await obterEmpresa(actor, i.empresa_id);
  return i;
}
export async function obterPrevia(actor: Actor, id: string) {
  const i = await carregarImportacao(actor, id);
  const conta = (await query('SELECT banco,apelido,agencia,conta FROM contas_bancarias WHERE id=$1', [i.conta_id])).rows[0];
  return { id: i.id as string, empresaId: i.empresa_id as string, competencia: i.competencia as string, nomeArquivo: i.nome_arquivo as string, status: i.status as string, conta, resumo: i.resumo, linhas: i.dados as LinhaPrevia[] };
}
export async function cancelarImportacao(actor: Actor, id: string) {
  const i = await carregarImportacao(actor, id);
  if (i.status !== 'previa') throw new AppError('Esta importação já foi concluída.');
  await tx(async (c) => {
    await c.query(`UPDATE importacoes SET status='cancelada', dados='[]'::jsonb WHERE id=$1`, [id]);
    await registrar(c, { usuarioId: actor.id, empresaId: i.empresa_id, acao: 'importacao.cancelar', entidade: 'importacao', entidadeId: id });
  });
}
/** Grava as movimentações. Duplicadas certas e fora do período nunca entram; possíveis duplicadas só se listadas em `incluirPossiveis` (índices). */
export async function confirmarImportacao(actor: Actor, id: string, incluirPossiveis: number[] = []) {
  const i = await carregarImportacao(actor, id);
  await exigirEditavel(actor, i.empresa_id, i.competencia);
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`conta:${i.conta_id}`]);
    const atual = (await c.query('SELECT status,dados FROM importacoes WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (atual.status !== 'previa') throw new AppError('Esta importação já foi concluída ou cancelada.');
    const linhas = atual.dados as LinhaPrevia[]; const extras = new Set(incluirPossiveis);
    let gravadas = 0, ignoradas = 0;
    for (let k = 0; k < linhas.length; k++) {
      const l = linhas[k];
      if (l.foraPeriodo || l.duplicada === 'certa' || (l.duplicada === 'possivel' && !extras.has(k)) || l.valor === 0) { ignoradas++; continue; }
      const r = await c.query(
        `INSERT INTO movimentacoes(empresa_id,conta_id,importacao_id,competencia,data,descricao_original,valor_centavos,saldo_centavos,id_externo,documento,chave_normalizada)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [i.empresa_id, i.conta_id, id, i.competencia, l.data, l.descricao, l.valor, l.saldo, l.idExterno, l.documento, chaveNormalizada(l.descricao)]);
      if (r.rowCount) gravadas++; else ignoradas++;
    }
    await classificarImportacao(c, i.empresa_id, id);
    await c.query(`UPDATE importacoes SET status='confirmada', confirmada_em=now(), dados='[]'::jsonb WHERE id=$1`, [id]);
    await registrar(c, { usuarioId: actor.id, empresaId: i.empresa_id, acao: 'importacao.confirmar', entidade: 'importacao', entidadeId: id, detalhes: { gravadas, ignoradas } });
    return { gravadas, ignoradas };
  });
}
export async function listarImportacoes(actor: Actor, empresaId: string, competencia: string) {
  const e = await obterEmpresa(actor, empresaId);
  return (await query(
    `SELECT i.id,i.nome_arquivo,i.status,i.criado_em,i.resumo,c.banco FROM importacoes i JOIN contas_bancarias c ON c.id=i.conta_id
      WHERE i.empresa_id=$1 AND i.competencia=$2 AND i.status<>'cancelada' ORDER BY i.criado_em DESC`, [e.id, competencia])).rows;
}


/** Envio direto para a conciliação (sem tela de prévia): lê, grava o que é novo e devolve o resumo.
 *  Ignora o que já existe (mesmo lançamento já importado) e o que é de outro mês; se o extrato inteiro é de UM outro mês,
 *  importa na conciliação desse mês. */
export async function importarDireto(actor: Actor, p: { empresaId: string; contaId?: string; competencia: string; nome: string; dados: Buffer }) {
  let competencia = p.competencia;
  let id = await criarPrevia(actor, { ...p, contaId: p.contaId ?? '' });
  let prev = await obterPrevia(actor, id);
  const meses = [...new Set(prev.linhas.map((l) => l.data.slice(0, 7)))];
  if (prev.resumo.aImportar === 0 && prev.linhas.length && prev.linhas.every((l) => l.foraPeriodo) && meses.length === 1) {
    const contaId = (await query('SELECT conta_id FROM importacoes WHERE id=$1', [id])).rows[0].conta_id as string; // a mesma conta já detectada
    await cancelarImportacao(actor, id);
    competencia = meses[0];
    id = await criarPrevia(actor, { ...p, contaId, competencia });
    prev = await obterPrevia(actor, id);
  }
  const r = await confirmarImportacao(actor, id, []);
  const res = prev.resumo as { duplicadasCertas: number; duplicadasPossiveis: number; foraPeriodo: number; conferenciaSaldo: { confere: boolean | null } | null };
  return { competencia, gravadas: r.gravadas, jaExistiam: res.duplicadasCertas + res.duplicadasPossiveis, outroMes: res.foraPeriodo, banco: prev.conta?.banco as string | undefined, saldoConfere: res.conferenciaSaldo?.confere ?? null };
}

/** Frase para o usuário depois do envio direto. */
export function resumoImportacao(r: Awaited<ReturnType<typeof importarDireto>>, mesPedido?: string) {
  const mes = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
  const partes = [r.gravadas ? `${r.gravadas} lançamento(s)${r.banco ? ` do ${r.banco}` : ''} foram para a conciliação de ${mes(r.competencia)}` : 'Nenhum lançamento novo neste extrato'];
  if (mesPedido && mesPedido !== r.competencia) partes.push(`o extrato é de ${mes(r.competencia)}`);
  if (r.jaExistiam) partes.push(`${r.jaExistiam} já existiam e foram ignorados`);
  if (r.outroMes) partes.push(`${r.outroMes} de outro mês ficaram de fora`);
  if (r.saldoConfere === true) partes.push('saldo do extrato conferido');
  if (r.saldoConfere === false) partes.push('ATENÇÃO: o saldo do extrato não fechou; confira se faltou alguma página');
  return partes.join('; ') + '.';
}
