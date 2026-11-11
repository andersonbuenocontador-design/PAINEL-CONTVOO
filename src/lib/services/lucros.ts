import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { obterEmpresa } from './empresas';
import { registrar } from './auditoria';
import { competenciaSchema } from './documentos';
import { listarRetiradas } from './retiradas';

/* Lucros dos sócios: compara o que o cliente informou (dia a dia, banco ou dinheiro) com as saídas do extrato
   que chega depois do fim do mês, e aponta o que pode ter sido esquecido. */

/** Folga de datas entre o dia informado e o dia no extrato (Pix agendado, TED no dia seguinte, fim de semana). */
export const FOLGA_DIAS = 5;

export const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9*•]+/g, ' ').trim();
const CONECTORES = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);

/** A descrição cita o sócio pelo nome? Com 2+ nomes exige o primeiro e o último ("JOAO DA SILVA" casa com "Pix enviado João Pedro Silva"). */
export function citaNome(texto: string, nome: string) {
  const t = ` ${normalizar(texto)} `;
  const p = normalizar(nome).split(' ').filter((x) => x.length >= 2 && !CONECTORES.has(x));
  if (!p.length) return false;
  if (p.length === 1) return p[0].length >= 4 && t.includes(` ${p[0]} `);
  return t.includes(` ${p[0]} `) && t.includes(` ${p[p.length - 1]} `);
}
/** A descrição traz o CPF do sócio, inteiro ou mascarado como os bancos mostram ("***.712.440-**"). */
export function citaCpf(texto: string, cpf: string | null) {
  if (!cpf || cpf.length !== 11) return false;
  if (texto.replace(/[^\d]/g, '').includes(cpf)) return true;
  const re = /[*•xX]{3}[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?[*•xX]{2}/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) if (m[1] + m[2] === cpf.slice(3, 9)) return true;
  return false;
}
const ehSaque = (texto: string) => /\b(SAQUE|SAQ|SAQUES|RETIRADA EM ESPECIE|RETIRADA ESPECIE)\b/.test(normalizar(texto));
/** Conta do plano que indica retirada de sócio / distribuição de lucros (não aporte, empréstimo ou pró-labore). */
export const contaDeRetirada = (nome: string | null) => !!nome && /RETIRADA|DISTRIBUI|DIVIDENDO|LUCROS? (PAGOS?|DISTRIBUIDOS?)/.test(normalizar(nome)) && !/APORTE|COLOCADO|EMPRESTIMO|PRO LABORE|CAPITAL SOCIAL/.test(normalizar(nome));

const dias = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000);
const centavos = (v: string | number) => Math.round(Number(v) * 100);
const somar = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

type Socio = { nome: string; cpf: string | null };
export type MovExtrato = { id: number; data: string; valor: number; descricao: string; conta_id: string; banco: string; conta_nome: string | null; participante: string | null; ignorada: boolean; motivo_ignorada: string | null;
  socio: string | null; porNome: boolean; porCpf: boolean; porCategoria: boolean; saque: boolean };
export type Informada = Awaited<ReturnType<typeof listarRetiradas>>['itens'][number];
export type Comparacao = Awaited<ReturnType<typeof compararRetiradas>>;

/** Por que este lançamento do extrato parece retirada de sócio (frase para o escritório). */
export function motivoSuspeita(m: Pick<MovExtrato, 'socio' | 'porNome' | 'porCpf' | 'porCategoria' | 'conta_nome'>) {
  const p: string[] = [];
  if (m.porNome) p.push(`nome do sócio ${m.socio} na descrição`);
  if (m.porCpf) p.push(`CPF do sócio${m.socio && !m.porNome ? ` ${m.socio}` : ''} na descrição`);
  if (m.porCategoria) p.push(`classificado como "${m.conta_nome}"`);
  return p.join(' · ');
}

export async function compararRetiradas(actor: Actor, empresaId: string, competencia: string) {
  exigirAdmin(actor);
  const emp = await obterEmpresa(actor, empresaId); competenciaSchema.parse(competencia);
  const ini = `${competencia}-01`;
  const fim = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const ret = await listarRetiradas(actor, emp.id, competencia);
  const informadas = ret.itens.filter((i) => i.tipo === 'lucros' || i.tipo === 'outras');

  const socios: Socio[] = (await query(`SELECT nome, cpf FROM socios WHERE empresa_id=$1 AND ativo`, [emp.id])).rows;
  for (const n of (await query(`SELECT DISTINCT socio_nome FROM retiradas WHERE empresa_id=$1 AND removido_em IS NULL`, [emp.id])).rows.map((r) => r.socio_nome as string))
    if (!socios.some((s) => normalizar(s.nome) === normalizar(n) || citaNome(s.nome, n))) socios.push({ nome: n, cpf: null });

  const brutos = (await query(
    `SELECT m.id, m.data::text data, m.valor_centavos::bigint valor, m.descricao_original descricao, m.conta_id, cb.banco || coalesce(' · ' || nullif(cb.apelido,''), ' · ' || nullif(cb.conta,''), '') banco,
            p.nome conta_nome, pa.nome participante, (ri.movimentacao_id IS NOT NULL) ignorada, ri.motivo motivo_ignorada
       FROM movimentacoes m JOIN contas_bancarias cb ON cb.id=m.conta_id
       LEFT JOIN plano_contas p ON p.empresa_id=m.empresa_id AND p.codigo=m.conta_codigo
       LEFT JOIN participantes pa ON pa.id=m.participante_id
       LEFT JOIN retiradas_ignoradas ri ON ri.movimentacao_id=m.id
      WHERE m.empresa_id=$1 AND m.valor_centavos < 0 AND m.data BETWEEN $2::date - $4::int AND $3::date + $4::int
      ORDER BY m.data, m.id`, [emp.id, ini, fim, FOLGA_DIAS])).rows;
  const movs: MovExtrato[] = brutos.map((r) => {
    const texto = `${r.descricao} ${r.participante ?? ''}`;
    const sN = socios.find((s) => citaNome(texto, s.nome)); const sC = socios.find((s) => citaCpf(texto, s.cpf));
    return { ...r, id: Number(r.id), valor: -Number(r.valor), socio: (sN ?? sC)?.nome ?? null, porNome: !!sN, porCpf: !!sC, porCategoria: contaDeRetirada(r.conta_nome), saque: ehSaque(r.descricao) };
  });
  const noMes = (m: MovExtrato) => m.data >= ini && m.data <= fim;
  const suspeita = (m: MovExtrato) => m.porNome || m.porCpf || m.porCategoria;
  const contasComExtrato = new Set((await query(`SELECT DISTINCT conta_id FROM movimentacoes WHERE empresa_id=$1 AND competencia=$2`, [emp.id, competencia])).rows.map((r) => r.conta_id as string));
  const citaSocio = (m: MovExtrato, socio: string) => !!m.socio && (normalizar(m.socio) === normalizar(socio) || citaNome(m.socio, socio) || citaNome(socio, m.socio));

  // 1) Mesmo valor e data próxima: pares com a melhor pontuação primeiro (conta certa, nome/CPF do sócio, categoria, dia).
  const pares: { i: Informada; m: MovExtrato; score: number; d: number }[] = [];
  for (const i of informadas) for (const m of movs) {
    if (m.valor !== centavos(i.valor)) continue;
    const d = Math.abs(dias(m.data, i.data)); if (d > FOLGA_DIAS) continue;
    if (i.forma === 'dinheiro' && !m.saque) continue; // dinheiro só confere com saque
    let score = 100 - 8 * d;
    if (i.conta_id) score += i.conta_id === m.conta_id ? 25 : -15;
    if (citaSocio(m, i.socio_nome)) score += 30; else if (m.socio) score -= 40;
    if (m.porCategoria) score += 10;
    if (m.ignorada) score -= 20;
    pares.push({ i, m, score, d });
  }
  pares.sort((a, b) => b.score - a.score || a.d - b.d);
  const usadasI = new Set<string>(), usadosM = new Set<number>();
  const conferidas: { informada: Informada; extrato: MovExtrato; dias: number; contaDiferente: boolean; saque: boolean }[] = [];
  for (const p of pares) {
    if (usadasI.has(p.i.id) || usadosM.has(p.m.id)) continue;
    usadasI.add(p.i.id); usadosM.add(p.m.id);
    conferidas.push({ informada: p.i, extrato: p.m, dias: p.d, contaDiferente: !!p.i.conta_id && p.i.conta_id !== p.m.conta_id, saque: p.i.forma === 'dinheiro' });
  }

  // 2) Mesmo sócio e data próxima, valor diferente: provável erro de digitação ou retirada parcial.
  const divergentes: { informada: Informada; extrato: MovExtrato; diferenca: number }[] = [];
  const candI = informadas.filter((i) => !usadasI.has(i.id) && i.forma !== 'dinheiro');
  const candM = movs.filter((m) => !usadosM.has(m.id) && !m.ignorada && (m.porNome || m.porCpf));
  const parD = candI.flatMap((i) => candM.filter((m) => citaSocio(m, i.socio_nome)).map((m) => ({ i, m, d: Math.abs(dias(m.data, i.data)) })))
    .filter((p) => p.d <= FOLGA_DIAS).sort((a, b) => a.d - b.d);
  for (const p of parD) {
    if (usadasI.has(p.i.id) || usadosM.has(p.m.id)) continue;
    usadasI.add(p.i.id); usadosM.add(p.m.id);
    divergentes.push({ informada: p.i, extrato: p.m, diferenca: p.m.valor - centavos(p.i.valor) });
  }

  // 3) O que sobrou.
  const sobraI = informadas.filter((i) => !usadasI.has(i.id));
  const emDinheiro = sobraI.filter((i) => i.forma === 'dinheiro');
  const semConferir = sobraI.filter((i) => i.forma !== 'dinheiro');
  const temExtrato = (i: Informada) => (i.conta_id ? contasComExtrato.has(i.conta_id) : contasComExtrato.size > 0);
  const naoEncontradas = semConferir.filter(temExtrato);
  const aguardandoExtrato = semConferir.filter((i) => !temExtrato(i));
  const esquecidas = movs.filter((m) => noMes(m) && !usadosM.has(m.id) && !m.ignorada && suspeita(m));
  const ignoradas = movs.filter((m) => noMes(m) && m.ignorada);

  const resumo = {
    informadas: informadas.length, totalInformado: somar(informadas.map((i) => centavos(i.valor))),
    conferidas: conferidas.length, esquecidas: esquecidas.length, totalEsquecido: somar(esquecidas.map((m) => m.valor)),
    naoEncontradas: naoEncontradas.length, divergentes: divergentes.length, emDinheiro: emDinheiro.length, aguardandoExtrato: aguardandoExtrato.length,
    extratoNoMes: contasComExtrato.size > 0,
    totalExtrato: somar([...conferidas.map((c) => c.extrato.valor), ...divergentes.map((d) => d.extrato.valor), ...esquecidas.map((m) => m.valor)]),
  };
  const status: 'atencao' | 'ok' | 'aguardando_extrato' | 'sem_movimento' =
    resumo.esquecidas || resumo.naoEncontradas || resumo.divergentes ? 'atencao'
    : !resumo.extratoNoMes ? (resumo.informadas || ret.envio ? 'aguardando_extrato' : 'sem_movimento')
    : resumo.aguardandoExtrato ? 'aguardando_extrato'
    : resumo.informadas || resumo.conferidas ? 'ok' : 'sem_movimento';
  // Total por sócio no mês (informado + esquecido no extrato) para o alerta dos R$ 50.000,00 (IRRF 10%, Lei 15.270/2025).
  const porSocio = new Map<string, number>();
  for (const i of informadas) porSocio.set(i.socio_nome, (porSocio.get(i.socio_nome) ?? 0) + centavos(i.valor));
  for (const m of esquecidas) if (m.socio) porSocio.set(m.socio, (porSocio.get(m.socio) ?? 0) + m.valor);
  const acimaDoLimite = [...porSocio].filter(([, v]) => v > 5_000_000).map(([socio, total]) => ({ socio, total }));

  return { empresa: { id: emp.id, razao_social: emp.razao_social as string }, competencia, envio: ret.envio, status, resumo, conferidas, divergentes, esquecidas, naoEncontradas, aguardandoExtrato, emDinheiro, ignoradas, acimaDoLimite, socios: socios.map((s) => s.nome) };
}

/** Aba "Lucros dos sócios": uma linha por empresa ativa, as que pedem atenção primeiro. */
export async function visaoLucros(actor: Actor, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  const ids = (await query(`SELECT id FROM empresas WHERE situacao='ativa' ORDER BY razao_social`)).rows.map((r) => r.id as string);
  const todas = [];
  for (const id of ids) todas.push(await compararRetiradas(actor, id, competencia));
  const ordem = { atencao: 0, aguardando_extrato: 1, ok: 2, sem_movimento: 3 } as const;
  return todas.sort((a, b) => ordem[a.status] - ordem[b.status] || a.empresa.razao_social.localeCompare(b.empresa.razao_social, 'pt-BR'));
}

/** "Não é retirada": o lançamento do extrato para de aparecer como possível esquecimento (fica registrado, com motivo). */
export async function marcarNaoRetirada(actor: Actor, movimentacaoId: number, motivo?: string) {
  exigirAdmin(actor);
  if (!Number.isInteger(movimentacaoId) || movimentacaoId <= 0) throw new AppError('Lançamento não encontrado.', 'nao_encontrado');
  const m = (await query('SELECT id, empresa_id FROM movimentacoes WHERE id=$1', [movimentacaoId])).rows[0];
  if (!m) throw new AppError('Lançamento não encontrado.', 'nao_encontrado');
  const mot = z.string().trim().max(200, 'Motivo muito longo (máx. 200).').optional().parse(motivo) || null;
  await tx(async (c) => {
    await c.query(`INSERT INTO retiradas_ignoradas(movimentacao_id,empresa_id,motivo,marcado_por) VALUES ($1,$2,$3,$4) ON CONFLICT (movimentacao_id) DO UPDATE SET motivo=EXCLUDED.motivo, marcado_por=EXCLUDED.marcado_por, marcado_em=now()`, [m.id, m.empresa_id, mot, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: m.empresa_id, acao: 'lucros.nao_e_retirada', entidade: 'movimentacao', entidadeId: String(m.id), detalhes: { motivo: mot } });
  });
}
export async function desfazerNaoRetirada(actor: Actor, movimentacaoId: number) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = (await c.query('DELETE FROM retiradas_ignoradas WHERE movimentacao_id=$1 RETURNING empresa_id', [movimentacaoId])).rows[0];
    if (!r) throw new AppError('Lançamento não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, empresaId: r.empresa_id, acao: 'lucros.desfazer_nao_e_retirada', entidade: 'movimentacao', entidadeId: String(movimentacaoId) });
  });
}
