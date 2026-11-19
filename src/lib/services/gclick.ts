import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { cifrar, decifrar } from '../cripto';
import { registrar } from './auditoria';
import { cnpjValido } from '../cnpj';

/* Integração com o G-Click (mesma API que o Contvoo Gestão usa): o escritório cola o client_id e o client_secret
   (Configurações → API do G-Click) numa tela do painel; o segredo fica cifrado no banco.
   Hoje: importar clientes (CNPJ, nome, apelido, telefone) e ligar às empresas do painel. */

export const GCLICK_BASE = 'https://api.gclick.com.br';
export type Cred = { id: string; segredo: string };
export type GclickCliente = { id: number; nome: string; apelido: string | null; emails?: { email?: string | null }[] | null; inscricao?: string | null; tipoInscricao?: string | null; status?: string | null; telefones?: { numero?: string | null }[] | null };
type Pagina<T> = { content: T[]; last?: boolean; totalElements?: number };

export async function lerCred(): Promise<Cred | null> {
  const m = new Map((await query(`SELECT chave, valor FROM configuracoes WHERE chave IN ('gclick_client_id','gclick_client_secret')`)).rows.map((r) => [r.chave as string, r.valor as string]));
  const id = m.get('gclick_client_id'), s = m.get('gclick_client_secret');
  if (!id || !s) return null;
  try { return { id, segredo: decifrar(s) }; } catch { return null; }
}
export async function statusGclick(actor: Actor) { exigirAdmin(actor); const c = await lerCred(); return { ligado: !!c, clientId: c?.id ?? null }; }

export async function salvarAcessoGclick(actor: Actor, p: { clientId: string; segredo?: string }) {
  exigirAdmin(actor); const id = p.clientId.trim(); const seg = (p.segredo ?? '').trim();
  if (!id) throw new AppError('Informe o client_id do G-Click.');
  const atual = await lerCred();
  if (!seg && !atual) throw new AppError('Cole o client_secret do G-Click.');
  await tx(async (c) => {
    const gravar = (k: string, v: string) => c.query(`INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES ($1,$2,$3) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()`, [k, v, actor.id]);
    await gravar('gclick_client_id', id); if (seg) await gravar('gclick_client_secret', cifrar(seg));
    await registrar(c, { usuarioId: actor.id, acao: 'gclick.configurar', entidade: 'configuracao', detalhes: { segredo_trocado: !!seg } });
  });
}
export async function desligarGclick(actor: Actor) {
  exigirAdmin(actor);
  await tx(async (c) => { await c.query(`DELETE FROM configuracoes WHERE chave IN ('gclick_client_id','gclick_client_secret')`); await registrar(c, { usuarioId: actor.id, acao: 'gclick.desligar', entidade: 'configuracao' }); });
}

export async function token(c: Cred) {
  let r: Response;
  try { r = await fetch(`${GCLICK_BASE}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.id, client_secret: c.segredo, grant_type: 'client_credentials' }), signal: AbortSignal.timeout(30000) }); }
  catch { throw new AppError('Não foi possível falar com o G-Click agora. Tente de novo em alguns minutos.'); }
  if (r.status === 400 || r.status === 401) throw new AppError('O G-Click recusou o client_id/client_secret. Confira em Configurações → API do G-Click.');
  if (!r.ok) throw new AppError(`O G-Click respondeu com erro ${r.status} ao entrar.`);
  return ((await r.json()) as { access_token: string }).access_token;
}
/** Todos os clientes do G-Click (páginas de 500). */
export async function todosClientes(c: Cred): Promise<GclickCliente[]> {
  const t = await token(c); const lista: GclickCliente[] = [];
  for (let page = 0; page < 50; page++) {
    let r: Response;
    try { r = await fetch(`${GCLICK_BASE}/clientes?size=500&page=${page}`, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, signal: AbortSignal.timeout(60000) }); }
    catch { throw new AppError('O G-Click não respondeu a tempo. Tente de novo.'); }
    if (!r.ok) throw new AppError(`O G-Click respondeu com erro ${r.status} ao listar os clientes.`);
    const p = (await r.json()) as Pagina<GclickCliente>; lista.push(...(p.content ?? []));
    if (p.last || !p.content?.length) break;
  }
  return lista;
}

const digitos = (s?: string | null) => (s ?? '').replace(/\D/g, '');
/** Primeiro celular brasileiro (aceita o formato antigo sem o 9) (DDD + 9 + 8 dígitos) entre os telefones do cliente, no formato 55DDNNNNNNNNN. */
export function celularDe(tels?: { numero?: string | null }[] | null) {
  for (const t of tels ?? []) {
    let d = digitos(t.numero); if (d.startsWith('55') && d.length >= 12) d = d.slice(2); if (d.startsWith('0')) d = d.slice(1);
    if (/^\d{2}9\d{8}$/.test(d)) return `55${d}`;
    if (/^\d{2}[6-9]\d{7}$/.test(d)) return `55${d.slice(0, 2)}9${d.slice(2)}`; // celular antigo, sem o 9 da frente (fixo começa com 2 a 5)
  }
  return null;
}
export type Previa = { ligadas: { empresaId: string; razao: string; gclickId: number; whatsappNovo: string | null; apelidoNovo: string | null }[];
  novas: { gclickId: number; nome: string; apelido: string | null; cnpj: string; whatsapp: string | null; status: string | null }[]; semCnpj: number };

/** Compara os clientes do G-Click com as empresas do painel (pelo CNPJ). Não grava nada. */
export async function previaGclick(actor: Actor): Promise<Previa> {
  exigirAdmin(actor); const c = await lerCred(); if (!c) throw new AppError('Ligue o G-Click primeiro (client_id e client_secret).');
  const clientes = await todosClientes(c);
  const empresas = (await query(`SELECT id, razao_social, nome_fantasia, cnpj, whatsapp, gclick_id FROM empresas`)).rows as { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; whatsapp: string | null; gclick_id: string | null }[];
  const porCnpj = new Map(empresas.map((e) => [e.cnpj, e]));
  const r: Previa = { ligadas: [], novas: [], semCnpj: 0 };
  for (const g of clientes) {
    const cnpj = digitos(g.inscricao);
    if (cnpj.length !== 14 || !cnpjValido(cnpj)) { r.semCnpj++; continue; }
    const zap = celularDe(g.telefones); const e = porCnpj.get(cnpj);
    if (e) r.ligadas.push({ empresaId: e.id, razao: e.razao_social, gclickId: g.id, whatsappNovo: !e.whatsapp && zap ? zap : null, apelidoNovo: !e.nome_fantasia && g.apelido ? g.apelido : null });
    else r.novas.push({ gclickId: g.id, nome: g.nome, apelido: g.apelido, cnpj, whatsapp: zap, status: g.status ?? null });
  }
  r.novas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return r;
}

/** Liga as empresas do painel aos clientes do G-Click (pelo CNPJ), completa WhatsApp e nome fantasia vazios
 *  e cria as empresas escolhidas (gclickIds). Nunca sobrescreve um dado já preenchido no painel. */
export async function importarGclick(actor: Actor, gclickIds: number[]) {
  const p = await previaGclick(actor);
  const escolhidas = new Set(gclickIds.filter((n) => Number.isInteger(n)));
  let ligadas = 0, criadas = 0, zaps = 0;
  await tx(async (c) => {
    for (const l of p.ligadas) {
      await c.query(`UPDATE empresas SET gclick_id=$2, whatsapp=COALESCE(whatsapp,$3), nome_fantasia=COALESCE(nome_fantasia,$4), atualizado_em=now() WHERE id=$1`, [l.empresaId, l.gclickId, l.whatsappNovo, l.apelidoNovo]);
      ligadas++; if (l.whatsappNovo) zaps++;
    }
    for (const n of p.novas) {
      if (!escolhidas.has(n.gclickId)) continue;
      const r = await c.query(`INSERT INTO empresas(razao_social,nome_fantasia,cnpj,whatsapp,gclick_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`, [n.nome.slice(0, 200), n.apelido, n.cnpj, n.whatsapp, n.gclickId]);
      if (!r.rowCount) continue;
      const id = r.rows[0].id as string;
      await registrar(c, { usuarioId: actor.id, empresaId: id, acao: 'empresa.criar', entidade: 'empresa', entidadeId: id, detalhes: { cnpj: n.cnpj, origem: 'gclick' } });
      await (await import('./conciliacao')).garantirPlanoGenerico(c, id); // como no cadastro manual: já nasce com o plano genérico
      criadas++; if (n.whatsapp) zaps++;
    }
    await registrar(c, { usuarioId: actor.id, acao: 'gclick.importar', entidade: 'empresa', detalhes: { ligadas, criadas, whatsapps: zaps } });
  });
  return { ligadas, criadas, whatsapps: zaps };
}
export const idsSchema = z.array(z.coerce.number().int().positive()).max(5000);
