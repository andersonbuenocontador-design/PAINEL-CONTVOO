import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { cifrar, decifrar } from '../cripto';
import { registrar } from './auditoria';

/* Integração direta com o Digisac (WhatsApp): o escritório cola a chave da API numa tela do painel; ela fica cifrada no banco.
   Envio (como no Contvoo Gestão): acha o contato pelo número e faz POST {conta}/api/v1/messages { text, type: 'chat', contactId, origin: 'bot' };
   sem contato, tenta { number, serviceId }. Sempre com "Authorization: Bearer <chave>". */

type Config = { url: string; token: string; serviceId: string | null; serviceNome: string | null };
const CHAVES = ['digisac_url', 'digisac_token', 'digisac_service_id', 'digisac_service_nome'] as const;

async function lerConfig(): Promise<Config | null> {
  const m = new Map((await query(`SELECT chave, valor FROM configuracoes WHERE chave = ANY($1)`, [CHAVES])).rows.map((r) => [r.chave as string, r.valor as string]));
  const url = m.get('digisac_url'), tok = m.get('digisac_token');
  if (!url || !tok) return null;
  let token: string; try { token = decifrar(tok); } catch { return null; }
  return { url, token, serviceId: m.get('digisac_service_id') ?? null, serviceNome: m.get('digisac_service_nome') ?? null };
}
/** Pronto para enviar: endereço, chave e conexão escolhida. */
export async function digisacPronto() { const c = await lerConfig(); return !!(c && c.serviceId); }

export async function statusDigisac(actor: Actor) {
  exigirAdmin(actor); const c = await lerConfig();
  return { temChave: !!c, url: c?.url ?? null, serviceId: c?.serviceId ?? null, serviceNome: c?.serviceNome ?? null, pronto: !!(c && c.serviceId) };
}

const urlSchema = z.string().trim().transform((v) => v.replace(/\/+$/, '').replace(/\/api(\/v1)?$/i, ''))
  .refine((v) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(v), 'Informe o endereço da conta Digisac, ex.: https://suaempresa.digisac.biz');
async function gravar(c: { query: typeof query }, actor: Actor, chave: string, valor: string | null) {
  if (valor === null) await c.query('DELETE FROM configuracoes WHERE chave=$1', [chave]);
  else await c.query(`INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES ($1,$2,$3) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()`, [chave, valor, actor.id]);
}
/** Salva endereço e (se informada) a chave. Chave em branco mantém a atual. */
export async function salvarAcessoDigisac(actor: Actor, p: { url: string; token?: string }) {
  exigirAdmin(actor); const url = urlSchema.parse(p.url); const token = (p.token ?? '').trim();
  const atual = await lerConfig();
  if (!token && !atual) throw new AppError('Cole a chave (token) da API do Digisac.');
  if (token && token.length < 10) throw new AppError('Essa chave parece curta demais. Copie a chave inteira da API do Digisac.');
  await tx(async (c) => {
    await gravar(c as never, actor, 'digisac_url', url);
    if (token) await gravar(c as never, actor, 'digisac_token', cifrar(token));
    if (atual && atual.url !== url) { await gravar(c as never, actor, 'digisac_service_id', null); await gravar(c as never, actor, 'digisac_service_nome', null); }
    await registrar(c, { usuarioId: actor.id, acao: 'digisac.configurar', entidade: 'configuracao', detalhes: { url, chave_trocada: !!token } });
  });
}
export async function escolherConexao(actor: Actor, serviceId: string, nome: string) {
  exigirAdmin(actor); if (!serviceId.trim()) throw new AppError('Escolha a conexão do WhatsApp.');
  await tx(async (c) => {
    await gravar(c as never, actor, 'digisac_service_id', serviceId.trim()); await gravar(c as never, actor, 'digisac_service_nome', nome.trim().slice(0, 120) || serviceId.trim());
    await registrar(c, { usuarioId: actor.id, acao: 'digisac.conexao', entidade: 'configuracao', detalhes: { serviceId: serviceId.trim() } });
  });
}
export async function desligarDigisac(actor: Actor) {
  exigirAdmin(actor);
  await tx(async (c) => { await c.query('DELETE FROM configuracoes WHERE chave = ANY($1)', [CHAVES]); await registrar(c, { usuarioId: actor.id, acao: 'digisac.desligar', entidade: 'configuracao' }); });
}

async function chamar(c: Config, metodo: 'GET' | 'POST', caminho: string, corpo?: object) {
  let r: Response;
  try {
    r = await fetch(`${c.url}/api/v1${caminho}`, { method: metodo, headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20000) });
  } catch { throw new AppError('Não foi possível falar com o Digisac agora. Confira o endereço da conta e tente de novo.'); }
  const texto = await r.text(); let json: unknown = null; try { json = JSON.parse(texto); } catch { /* resposta não-JSON */ }
  if (r.status === 401 || r.status === 403) throw new AppError('O Digisac recusou a chave da API. Gere uma chave nova no Digisac e cole de novo.');
  if (!r.ok) throw new AppError(`O Digisac respondeu com erro ${r.status}${texto ? `: ${texto.replace(/\s+/g, ' ').slice(0, 160)}` : ''}.`);
  return json;
}
export type Conexao = { id: string; nome: string; tipo: string };
/** Conexões (números de WhatsApp e outros canais) da conta Digisac, para o escritório escolher. */
export async function listarConexoes(actor: Actor): Promise<Conexao[]> {
  exigirAdmin(actor); const c = await lerConfig(); if (!c) throw new AppError('Salve primeiro o endereço e a chave do Digisac.');
  const j = await chamar(c, 'GET', '/services?perPage=100') as unknown;
  const lista = (Array.isArray(j) ? j : ((j as { data?: unknown[]; rows?: unknown[] })?.data ?? (j as { rows?: unknown[] })?.rows ?? [])) as Record<string, unknown>[];
  return lista.filter((s) => s && s.id).map((s) => ({ id: String(s.id), nome: String(s.name ?? s.id), tipo: String(s.type ?? '') }))
    .sort((a, b) => Number(!/whats/i.test(a.tipo)) - Number(!/whats/i.test(b.tipo)) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const soNumero = (n: string) => { const d = n.replace(/\D/g, ''); return d.length <= 11 ? `55${d}` : d; };
/** O WhatsApp às vezes guarda celular brasileiro sem o 9 extra (55 + DDD + 8 dígitos): procura dos dois jeitos. */
export const variantesNumero = (n: string) => { const v = [n]; if (/^55\d{2}9\d{8}$/.test(n)) v.push(n.slice(0, 4) + n.slice(5)); else if (/^55\d{2}\d{8}$/.test(n)) v.push(`${n.slice(0, 4)}9${n.slice(4)}`); return v; };
type Pagina<T> = { data?: T[] };
/** Contato do Digisac com este número (o mesmo jeito de enviar que o Contvoo Gestão usa: para o contato, abrindo o chamado para a equipe).
 *  O nome é o do contato no Digisac (ligado ao G-Click). */
async function contatoPorNumero(c: Config, n: string): Promise<{ id: string; nome: string } | null> {
  const q = JSON.stringify({ where: { 'data.number': { $in: variantesNumero(n) }, isGroup: false }, attributes: ['id', 'name', 'internalName', 'serviceId'], perPage: 5, page: 1 });
  try {
    const p = await chamar(c, 'GET', `/contacts?query=${encodeURIComponent(q)}`) as Pagina<{ id: string; name?: string | null; internalName?: string | null; serviceId?: string }>;
    const lista = p?.data ?? [];
    const x = lista.find((y) => y.serviceId === c.serviceId) ?? lista[0];
    return x ? { id: x.id, nome: String(x.internalName || x.name || '').trim() } : null;
  } catch { return null; } // busca falhou: tenta mandar direto para o número
}
/** Nome completo do contato no Digisac para este número (null se não achar ou se o Digisac não estiver configurado). */
export async function contatoDigisac(numero: string) {
  const c = await lerConfig(); if (!c) return null;
  return contatoPorNumero(c, soNumero(numero));
}
/** Envia uma mensagem de WhatsApp pelo Digisac. `texto` pode ser uma função que recebe o nome completo do contato no Digisac. */
export async function enviarWhatsappDigisac(numero: string, texto: string | ((nomeContato: string) => string)) {
  const c = await lerConfig(); if (!c || !c.serviceId) throw new AppError('O WhatsApp pelo Digisac ainda não foi configurado.');
  const n = soNumero(numero); if (n.length < 12 || n.length > 13) throw new AppError('Número de WhatsApp inválido.');
  const contato = await contatoPorNumero(c, n);
  const msg = typeof texto === 'function' ? texto(contato?.nome ?? '') : texto;
  if (contato) return chamar(c, 'POST', '/messages', { text: msg, type: 'chat', contactId: contato.id, origin: 'bot' });
  try { return await chamar(c, 'POST', '/messages', { text: msg, type: 'chat', number: n, serviceId: c.serviceId, origin: 'bot' }); }
  catch (e) {
    if (e instanceof AppError && /recusou a chave/.test(e.message)) throw e;
    throw new AppError(`Este número não está nos contatos do Digisac e o envio direto não foi aceito. Cadastre o contato no Digisac (ou mande a 1ª mensagem por lá) e tente de novo. Detalhe: ${e instanceof Error ? e.message : String(e)}`);
  }
}
export async function enviarTesteDigisac(actor: Actor, numero: string) {
  exigirAdmin(actor);
  await enviarWhatsappDigisac(numero, 'Teste do Painel Contvoo: a cobrança pelo WhatsApp (Digisac) está funcionando. ✅');
  await registrar({ query } as never, { usuarioId: actor.id, acao: 'digisac.teste', entidade: 'configuracao' });
}
