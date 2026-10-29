import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { cifrar, decifrar } from '../cripto';
import { gerarSegredo, uriOtpauth, verificarTotp } from '../totp';
import { registrar } from './auditoria';

/* ---------- limite de tentativas por IP ---------- */
const LIMITE_IP = 30; const JANELA_MIN = 15;
const hashIp = (ip: string) => createHash('sha256').update(`${ip}|${process.env.SESSION_SECRET ?? ''}`).digest('hex');
export async function ipBloqueado(ip: string) {
  const n = (await query(`SELECT coalesce(sum(falhas),0)::int n FROM login_falhas_ip WHERE ip_hash=$1 AND janela > now() - make_interval(mins => $2)`, [hashIp(ip), JANELA_MIN])).rows[0].n;
  return n >= LIMITE_IP;
}
export async function registrarFalhaIp(ip: string) {
  await query(`INSERT INTO login_falhas_ip(ip_hash,janela,falhas) VALUES ($1, date_bin(make_interval(mins => $2), now(), timestamptz '2000-01-01'), 1) ON CONFLICT (ip_hash,janela) DO UPDATE SET falhas=login_falhas_ip.falhas+1`, [hashIp(ip), JANELA_MIN]);
  await query(`DELETE FROM login_falhas_ip WHERE janela < now() - interval '1 day'`);
}

/* ---------- verificação em duas etapas (TOTP) ---------- */
const COST_REC = process.env.NODE_ENV === 'test' ? 4 : 8; // códigos de recuperação têm alta entropia
const gerarCodigosRecuperacao = () => Array.from({ length: 8 }, () => { const h = randomBytes(5).toString('hex'); return `${h.slice(0, 5)}-${h.slice(5)}`; });
const ehCodigoRecuperacao = (c: string) => /^[0-9a-f]{5}-[0-9a-f]{5}$/i.test(c.trim());

export async function statusMfa(userId: string) {
  const u = (await query('SELECT mfa_ativo, mfa_segredo IS NOT NULL AS pendente FROM usuarios WHERE id=$1', [userId])).rows[0];
  const rest = (await query('SELECT count(*)::int n FROM mfa_recuperacao WHERE usuario_id=$1 AND usado_em IS NULL', [userId])).rows[0].n as number;
  return { ativo: !!u?.mfa_ativo, pendente: !!u?.pendente && !u?.mfa_ativo, codigosRestantes: rest };
}
/** Gera o segredo (guardado cifrado) e devolve o que o app autenticador precisa. Só vale depois de confirmar um código. */
export async function iniciarMfa(actor: Actor) {
  const u = (await query('SELECT email,mfa_ativo FROM usuarios WHERE id=$1 AND ativo', [actor.id])).rows[0];
  if (!u) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
  if (u.mfa_ativo) throw new AppError('A verificação em duas etapas já está ativa.');
  const segredo = gerarSegredo();
  await query('UPDATE usuarios SET mfa_segredo=$2 WHERE id=$1', [actor.id, cifrar(segredo)]);
  return { segredo, uri: uriOtpauth(u.email, segredo) };
}
export async function segredoPendente(userId: string) {
  const u = (await query('SELECT email,mfa_ativo,mfa_segredo FROM usuarios WHERE id=$1 AND ativo', [userId])).rows[0];
  if (!u || u.mfa_ativo || !u.mfa_segredo) return null;
  const segredo = decifrar(u.mfa_segredo); return { segredo, uri: uriOtpauth(u.email, segredo) };
}
/** Confirma o primeiro código, liga a proteção e devolve 8 códigos de recuperação (mostrados UMA vez; guardados só como hash). */
export async function ativarMfa(actor: Actor, codigo: string) {
  const u = (await query('SELECT mfa_ativo,mfa_segredo FROM usuarios WHERE id=$1 AND ativo', [actor.id])).rows[0];
  if (!u?.mfa_segredo || u.mfa_ativo) throw new AppError('Comece a configuração pelo botão "Configurar".');
  const passo = verificarTotp(decifrar(u.mfa_segredo), codigo);
  if (passo == null) throw new AppError('Código incorreto. Confira a hora do celular e digite o código atual.', 'auth');
  const codigos = gerarCodigosRecuperacao(); const hashes = await Promise.all(codigos.map((c) => bcrypt.hash(c.replace('-', ''), COST_REC)));
  await tx(async (c) => {
    await c.query('UPDATE usuarios SET mfa_ativo=true, mfa_ativado_em=now(), mfa_ultimo_passo=$2 WHERE id=$1', [actor.id, passo]);
    await c.query('DELETE FROM mfa_recuperacao WHERE usuario_id=$1', [actor.id]);
    for (const h of hashes) await c.query('INSERT INTO mfa_recuperacao(usuario_id,codigo_hash) VALUES ($1,$2)', [actor.id, h]);
    await registrar(c, { usuarioId: actor.id, acao: 'mfa.ativar', entidade: 'usuario', entidadeId: actor.id });
  });
  return codigos;
}
export type UsuarioLogin = { id: string; nome: string; email: string; papel: 'admin' | 'cliente'; deve_trocar_senha: boolean; token_version: number; mfa_ativo: boolean };
/** 2º passo do login: código do app OU código de recuperação (uso único). Erros contam para o mesmo bloqueio temporário da senha. */
export async function verificarSegundoFator(userId: string, codigo: string): Promise<UsuarioLogin> {
  const falha = new AppError('Código inválido.', 'auth');
  const u = (await query('SELECT * FROM usuarios WHERE id=$1 AND ativo', [userId])).rows[0];
  if (!u || !u.mfa_ativo || !u.mfa_segredo) throw falha;
  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) throw new AppError('Acesso temporariamente bloqueado. Tente novamente mais tarde.', 'auth');
  let ok = false; let tipo = 'totp';
  if (ehCodigoRecuperacao(codigo)) {
    tipo = 'recuperacao'; const puro = codigo.trim().toLowerCase().replace('-', '');
    const lista = (await query('SELECT id,codigo_hash FROM mfa_recuperacao WHERE usuario_id=$1 AND usado_em IS NULL', [userId])).rows;
    for (const r of lista) if (await bcrypt.compare(puro, r.codigo_hash)) {
      // marca como usado só se ainda estava livre (duas tentativas simultâneas não gastam o mesmo código duas vezes)
      ok = (await query('UPDATE mfa_recuperacao SET usado_em=now() WHERE id=$1 AND usado_em IS NULL', [r.id])).rowCount === 1; break;
    }
  } else {
    const passo = verificarTotp(decifrar(u.mfa_segredo), codigo);
    if (passo != null) ok = (await query('UPDATE usuarios SET mfa_ultimo_passo=$2 WHERE id=$1 AND (mfa_ultimo_passo IS NULL OR mfa_ultimo_passo < $2)', [userId, passo])).rowCount === 1; // anti-replay
  }
  if (!ok) {
    await tx(async (c) => {
      const r = await c.query(`UPDATE usuarios SET falhas_login=falhas_login+1, bloqueado_ate = CASE WHEN falhas_login+1 >= 5 THEN now() + interval '15 minutes' ELSE bloqueado_ate END WHERE id=$1 RETURNING falhas_login`, [userId]);
      await registrar(c, { usuarioId: userId, acao: 'mfa.falha', entidade: 'usuario', entidadeId: userId, detalhes: { falhas: r.rows[0].falhas_login } });
    });
    throw falha;
  }
  await tx(async (c) => {
    await c.query('UPDATE usuarios SET falhas_login=0, bloqueado_ate=NULL WHERE id=$1', [userId]);
    await registrar(c, { usuarioId: userId, acao: 'login.sucesso', entidade: 'usuario', entidadeId: userId, detalhes: { mfa: tipo } });
  });
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, deve_trocar_senha: u.deve_trocar_senha, token_version: u.token_version, mfa_ativo: true };
}
/** Perdeu o celular: o escritório desliga a proteção (e derruba as sessões); a pessoa configura de novo no próximo acesso. */
export async function redefinirMfa(actor: Actor, usuarioId: string) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE usuarios SET mfa_ativo=false, mfa_segredo=NULL, mfa_ativado_em=NULL, mfa_ultimo_passo=NULL, token_version=token_version+1 WHERE id=$1 RETURNING id', [usuarioId]);
    if (!r.rowCount) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
    await c.query('DELETE FROM mfa_recuperacao WHERE usuario_id=$1', [usuarioId]);
    await registrar(c, { usuarioId: actor.id, acao: 'mfa.redefinir', entidade: 'usuario', entidadeId: usuarioId });
  });
}
