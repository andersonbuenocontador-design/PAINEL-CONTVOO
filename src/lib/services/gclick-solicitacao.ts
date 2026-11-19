import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { registrar } from './auditoria';
import { soDigitos } from '../cnpj';
import { competenciaSchema } from './documentos';
import { mesPorExtenso } from './integracao';
import { GCLICK_BASE, celularDe, lerCred, todosClientes, token, type Cred, type GclickCliente } from './gclick';
import { enviarWhatsappDigisac } from './digisac';
import { SOLICITACAO_PADRAO, TAREFA_PADRAO, montarSolicitacao } from '../mensagem-solicitacao';

/* "Solicitação de documentos" do G-Click em um clique:
   - quem TEM e-mail no G-Click: o painel dá o ✔ na 1ª atividade da tarefa (POST /atividades/resposta), igual ao botão verde
     do G-Click; o G-Click então manda o e-mail dele sozinho (atividade "Enviar para o cliente", AUTO);
   - quem NÃO tem e-mail: o painel manda a mensagem padrão pelo WhatsApp (Digisac).
   Cada tarefa/canal é registrado em gclick_envios: um segundo clique nunca manda de novo. */

export type ConfigSolicitacao = { sistema: string; usuario: string; tarefa: string; mensagem: string; mensagemPersonalizada: boolean };
const CHAVE = 'gclick_solicitacao';

export async function lerConfigSolicitacao(): Promise<ConfigSolicitacao> {
  const v = (await query(`SELECT valor FROM configuracoes WHERE chave=$1`, [CHAVE])).rows[0]?.valor as string | undefined;
  let j: Partial<ConfigSolicitacao> = {}; try { j = v ? JSON.parse(v) : {}; } catch { /* config inválida: usa o padrão */ }
  return { sistema: j.sistema ?? '', usuario: j.usuario || 'gclickbot', tarefa: j.tarefa || TAREFA_PADRAO, mensagem: j.mensagem || SOLICITACAO_PADRAO, mensagemPersonalizada: !!j.mensagem };
}
const configSchema = z.object({
  sistema: z.string().trim().max(100),
  usuario: z.string().trim().max(100).transform((v) => v || 'gclickbot'),
  tarefa: z.string().trim().min(3, 'Informe o nome da tarefa do G-Click.').max(200),
  mensagem: z.string().transform((v) => v.replace(/\r\n/g, '\n').trim()).refine((v) => v.length <= 1500, 'Mensagem muito longa (máx. 1500 caracteres).'),
});
export async function salvarConfigSolicitacao(actor: Actor, input: z.input<typeof configSchema>) {
  exigirAdmin(actor); const d = configSchema.parse(input);
  const valor = JSON.stringify({ sistema: d.sistema, usuario: d.usuario, tarefa: d.tarefa, mensagem: d.mensagem && d.mensagem !== SOLICITACAO_PADRAO.trim() ? d.mensagem : '' });
  await tx(async (c) => {
    await c.query(`INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES ($1,$2,$3) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()`, [CHAVE, valor, actor.id]);
    await registrar(c, { usuarioId: actor.id, acao: 'gclick.solicitacao_configurar', entidade: 'configuracao', detalhes: { tarefa: d.tarefa, sistema: !!d.sistema } });
  });
}

type Tarefa = { id: string; nome: string; status: string; clienteId: number; clienteInscricao?: string | null; clienteApelido?: string | null; dataCompetencia?: string | null; dataVencimento?: string | null };
type Atividade = { id: string; nome: string; ordem: string | number; tipo: string; respondida: boolean };
export type ItemSolicitacao = { tarefaId: string; clienteId: number; empresa: string; inscricao: string; emails: number; celular: string | null;
  empresaId: string | null; vencimento: string | null; envio: { status: string; detalhe: string | null; em: string } | null };
export type PreviaSolicitacao = { competencia: string; mes: string; tarefa: string; total: number; concluidas: number;
  porEmail: ItemSolicitacao[]; porWhatsapp: ItemSolicitacao[]; semContato: ItemSolicitacao[] };

const ABERTA = new Set(['A', 'S', 'E', 'P', 'Q']); // não concluída/dispensada/cancelada/finalizada
const emailValido = (e?: string | null) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((e ?? '').trim());
const ultimoDia = (c: string) => new Date(Date.UTC(Number(c.slice(0, 4)), Number(c.slice(5, 7)), 0)).toISOString().slice(0, 10);
const dataBr = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

async function gclickGet<T>(t: string, caminho: string): Promise<T> {
  let r: Response;
  try { r = await fetch(`${GCLICK_BASE}${caminho}`, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, signal: AbortSignal.timeout(60000) }); }
  catch { throw new AppError('O G-Click não respondeu a tempo. Tente de novo.'); }
  if (!r.ok) throw new AppError(`O G-Click respondeu com erro ${r.status}.`);
  return (await r.json()) as T;
}
/** Tarefas da competência com o nome configurado (o filtro "nome" do G-Click é parcial: confere o nome exato aqui). */
async function tarefasDaCompetencia(t: string, nome: string, comp: string): Promise<Tarefa[]> {
  const lista: Tarefa[] = [];
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ categoria: 'Obrigacao', nome, dataCompetenciaInicio: `${comp}-01`, dataCompetenciaFim: ultimoDia(comp), size: '1000', page: String(page) });
    const p = await gclickGet<{ content?: Tarefa[]; last?: boolean }>(t, `/tarefas?${q}`);
    lista.push(...(p.content ?? [])); if (p.last || !p.content?.length) break;
  }
  const alvo = nome.trim().toLowerCase();
  return lista.filter((x) => (x.nome ?? '').trim().toLowerCase() === alvo && (x.dataCompetencia ?? '').startsWith(comp));
}

async function credOuErro(): Promise<Cred> { const c = await lerCred(); if (!c) throw new AppError('Ligue o G-Click primeiro (client_id e client_secret).'); return c; }

async function montarPrevia(c: Cred, comp: string, cfg: ConfigSolicitacao) {
  const t = await token(c);
  const [tarefas, clientes] = await Promise.all([tarefasDaCompetencia(t, cfg.tarefa, comp), todosClientes(c)]);
  const porId = new Map<number, GclickCliente>(clientes.map((x) => [x.id, x]));
  const ids = [...new Set(tarefas.map((x) => x.clienteId))];
  const painel = new Map<number, { id: string; whatsapp: string | null }>((await query(`SELECT id, whatsapp, gclick_id::float8 g FROM empresas WHERE gclick_id = ANY($1::bigint[])`, [ids])).rows.map((r) => [Number(r.g), { id: r.id as string, whatsapp: r.whatsapp as string | null }]));
  const envios = new Map<string, { status: string; detalhe: string | null; em: string }>((await query(`SELECT tarefa_id, canal, status, detalhe, enviado_em FROM gclick_envios WHERE tarefa_id = ANY($1::text[])`, [tarefas.map((x) => x.id)])).rows
    .map((r) => [`${r.tarefa_id}|${r.canal}`, { status: r.status as string, detalhe: r.detalhe as string | null, em: new Date(r.enviado_em).toISOString() }]));
  const previa: PreviaSolicitacao = { competencia: comp, mes: mesPorExtenso(comp), tarefa: cfg.tarefa, total: tarefas.length, concluidas: 0, porEmail: [], porWhatsapp: [], semContato: [] };
  for (const x of tarefas) {
    if (!ABERTA.has(x.status)) { previa.concluidas++; continue; }
    const cli = porId.get(x.clienteId); const emp = painel.get(x.clienteId);
    const emails = (cli?.emails ?? []).filter((e) => emailValido(e.email)).length;
    const celular = emp?.whatsapp || celularDe(cli?.telefones);
    const canal = emails ? 'gclick' : 'whatsapp';
    const item: ItemSolicitacao = { tarefaId: x.id, clienteId: x.clienteId, empresa: (cli?.apelido || x.clienteApelido || cli?.nome || `Cliente ${x.clienteId}`).trim(),
      inscricao: soDigitos(x.clienteInscricao || cli?.inscricao || ''), emails, celular: celular ?? null, empresaId: emp?.id ?? null, vencimento: x.dataVencimento ?? null, envio: envios.get(`${x.id}|${canal}`) ?? null };
    (emails ? previa.porEmail : celular ? previa.porWhatsapp : previa.semContato).push(item);
  }
  const ordem = (a: ItemSolicitacao, b: ItemSolicitacao) => a.empresa.localeCompare(b.empresa, 'pt-BR');
  previa.porEmail.sort(ordem); previa.porWhatsapp.sort(ordem); previa.semContato.sort(ordem);
  return { previa, t };
}

/** Prévia: só lê (G-Click e painel). Nada é enviado. */
export async function previaSolicitacao(actor: Actor, competencia: string): Promise<PreviaSolicitacao> {
  exigirAdmin(actor); const comp = competenciaSchema.parse(competencia);
  return (await montarPrevia(await credOuErro(), comp, await lerConfigSolicitacao())).previa;
}

/** Reserva a tarefa/canal antes de enviar (dois cliques ao mesmo tempo não mandam duas vezes). Falha anterior pode ser tentada de novo. */
async function reservar(actor: Actor, it: ItemSolicitacao, canal: 'gclick' | 'whatsapp', comp: string) {
  const r = await query(
    `INSERT INTO gclick_envios(tarefa_id,canal,competencia,cliente_id,status,enviado_por) VALUES ($1,$2,$3,$4,'enviando',$5)
     ON CONFLICT (tarefa_id,canal) DO UPDATE SET status='enviando', detalhe=NULL, enviado_por=EXCLUDED.enviado_por, enviado_em=now() WHERE gclick_envios.status='erro'
     RETURNING tarefa_id`, [it.tarefaId, canal, comp, it.clienteId, actor.id]);
  return !!r.rowCount;
}
const concluir = (it: ItemSolicitacao, canal: string, ok: boolean, detalhe: string | null) =>
  query(`UPDATE gclick_envios SET status=$3, detalhe=$4, enviado_em=now() WHERE tarefa_id=$1 AND canal=$2`, [it.tarefaId, canal, ok ? 'ok' : 'erro', detalhe?.slice(0, 300) ?? null]);
const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Até `limite` de cada vez, `paralelo` ao mesmo tempo (o G-Click e o Digisac não gostam de rajadas). */
async function emLotes<T>(itens: T[], paralelo: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < itens.length; i += paralelo) await Promise.all(itens.slice(i, i + paralelo).map(fn));
}
export type Resultado = { enviados: number; erros: number; pulados: number; primeiroErro: string | null };

/** ✔ na 1ª atividade (checklist) da tarefa, como o botão verde do G-Click: o G-Click manda o e-mail sozinho. */
async function responderAtividade(t: string, cfg: ConfigSolicitacao, it: ItemSolicitacao, comp: string): Promise<string> {
  const ativs = await gclickGet<Atividade[]>(t, `/tarefas/${encodeURIComponent(it.tarefaId)}/atividades`);
  const ordenadas = [...ativs].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  const alvo = ordenadas.find((a) => a.nome?.trim().toLowerCase() === cfg.tarefa.trim().toLowerCase()) ?? ordenadas.find((a) => a.tipo === 'C') ?? ordenadas[0];
  if (!alvo) throw new AppError('A tarefa não tem atividades no G-Click.');
  if (alvo.respondida) return 'já estava com ✔ no G-Click';
  if (!it.inscricao) throw new AppError('Cliente sem CNPJ/CPF no G-Click.');
  const fd = new FormData();
  fd.set('idAtividade', alvo.id); fd.set('competencia', comp.replace('-', '')); fd.set('inscricao', it.inscricao); fd.set('usuario', cfg.usuario); fd.set('sistema', cfg.sistema);
  let r: Response;
  try { r = await fetch(`${GCLICK_BASE}/atividades/resposta`, { method: 'POST', headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, body: fd, signal: AbortSignal.timeout(60000) }); }
  catch { throw new AppError('O G-Click não respondeu a tempo.'); }
  const corpo = await r.text().catch(() => '');
  if (!r.ok) throw new AppError(`G-Click recusou (${r.status}): ${corpo.slice(0, 200) || 'sem detalhe'}`);
  // o G-Click às vezes responde 200 com {"status":"erro","msg":...}
  if (/"status"\s*:\s*"erro"/i.test(corpo)) { const m = corpo.match(/"msg"\s*:\s*"([^"]*)"/); throw new AppError(`G-Click: ${m?.[1] ?? corpo.slice(0, 200)}`); }
  return 'ok';
}

const loteSchema = z.object({ competencia: competenciaSchema, teste: z.boolean() });

/** Clique 1: dá o ✔ no G-Click em todas as tarefas abertas de clientes COM e-mail (o G-Click envia o e-mail). `teste`: só a primeira. */
export async function enviarPorGclick(actor: Actor, p: { competencia: string; teste: boolean }): Promise<Resultado> {
  exigirAdmin(actor); const { competencia: comp, teste } = loteSchema.parse(p);
  const cfg = await lerConfigSolicitacao();
  if (!cfg.sistema) throw new AppError('Informe o código do "sistema" de integração do G-Click na configuração abaixo antes de enviar.');
  const { previa, t } = await montarPrevia(await credOuErro(), comp, cfg);
  let alvo = previa.porEmail.filter((x) => x.envio?.status !== 'ok' && x.envio?.status !== 'enviando');
  if (teste) alvo = alvo.slice(0, 1);
  const res: Resultado = { enviados: 0, erros: 0, pulados: 0, primeiroErro: null };
  await emLotes(alvo, 4, async (it) => {
    if (!(await reservar(actor, it, 'gclick', comp))) { res.pulados++; return; }
    try { const d = await responderAtividade(t, cfg, it, comp); await concluir(it, 'gclick', true, d === 'ok' ? null : d); res.enviados++; }
    catch (e) { await concluir(it, 'gclick', false, msgErro(e)); res.erros++; res.primeiroErro ??= `${it.empresa}: ${msgErro(e)}`; }
  });
  await registrar({ query } as never, { usuarioId: actor.id, acao: 'gclick.solicitacao_email', entidade: 'gclick', detalhes: { competencia: comp, teste, ...res } });
  return res;
}

/** Clique 2: mensagem padrão pelo WhatsApp (Digisac) para as tarefas abertas de clientes SEM e-mail. `teste`: só a primeira. */
export async function enviarPorWhatsapp(actor: Actor, p: { competencia: string; teste: boolean }): Promise<Resultado> {
  exigirAdmin(actor); const { competencia: comp, teste } = loteSchema.parse(p);
  const cfg = await lerConfigSolicitacao();
  const { previa } = await montarPrevia(await credOuErro(), comp, cfg);
  let alvo = previa.porWhatsapp.filter((x) => x.envio?.status !== 'ok' && x.envio?.status !== 'enviando');
  if (teste) alvo = alvo.slice(0, 1);
  const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const res: Resultado = { enviados: 0, erros: 0, pulados: 0, primeiroErro: null };
  await emLotes(alvo, 3, async (it) => {
    if (!(await reservar(actor, it, 'whatsapp', comp))) { res.pulados++; return; }
    const dados = { empresa: it.empresa, mes: previa.mes, vencimento: dataBr(it.vencimento), link: base ? (it.empresaId ? `${base}/cliente/${it.empresaId}/documentos?competencia=${comp}` : base) : null };
    try { await enviarWhatsappDigisac(it.celular!, (nome) => montarSolicitacao(cfg.mensagem, { nome, ...dados })); await concluir(it, 'whatsapp', true, null); res.enviados++; }
    catch (e) { await concluir(it, 'whatsapp', false, msgErro(e)); res.erros++; res.primeiroErro ??= `${it.empresa}: ${msgErro(e)}`; }
  });
  await registrar({ query } as never, { usuarioId: actor.id, acao: 'gclick.solicitacao_whatsapp', entidade: 'gclick', detalhes: { competencia: comp, teste, ...res } });
  return res;
}
