import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { buscarUsuarioSessao, type UsuarioSessao } from './services/usuarios';

const COOKIE = 'painel_sessao'; const COOKIE_MFA = 'painel_mfa';
const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto demais (mín. 32 caracteres)');
  return new TextEncoder().encode(s);
};

export async function criarSessao(u: Pick<UsuarioSessao, 'id' | 'token_version'>) {
  const token = await new SignJWT({ tv: u.token_version, p: 's' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id).setIssuedAt().setExpirationTime('8h').sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 3600 });
}
export async function encerrarSessao() { (await cookies()).delete(COOKIE); (await cookies()).delete(COOKIE_MFA); }

/** Senha correta + 2FA ativo: guarda por 5 minutos só a prova de que a senha passou. Não dá acesso a nada. */
export async function criarMfaPendente(userId: string) {
  const token = await new SignJWT({ p: 'mfa' }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('5m').sign(key());
  (await cookies()).set(COOKIE_MFA, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 300 });
}
export async function lerMfaPendente(): Promise<string | null> {
  const t = (await cookies()).get(COOKIE_MFA)?.value; if (!t) return null;
  try { const { payload } = await jwtVerify(t, key(), { algorithms: ['HS256'] }); return payload.p === 'mfa' && payload.sub ? String(payload.sub) : null; } catch { return null; }
}
export async function limparMfaPendente() { (await cookies()).delete(COOKIE_MFA); }

/** Valida assinatura E reconfere no banco (usuário ativo, token_version atual). */
export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key(), { algorithms: ['HS256'] });
    if (payload.p !== 's') return null; // outro tipo de token (ex.: 2º fator pendente) nunca vale como sessão
    return await buscarUsuarioSessao(String(payload.sub), Number(payload.tv));
  } catch { return null; }
}

export async function exigirUsuario(papel?: 'admin' | 'cliente') {
  const u = await usuarioAtual();
  if (!u) redirect('/login');
  if (u.deve_trocar_senha) redirect('/trocar-senha');
  if (u.papel === 'admin' && process.env.EXIGIR_2FA_ADMIN === '1' && !u.mfa_ativo) redirect('/conta/seguranca?obrigatorio=1');
  if (papel && u.papel !== papel) redirect(u.papel === 'admin' ? '/admin' : '/cliente');
  return u;
}

/** Verificação em duas etapas para clientes: desligada por escolha do escritório (MFA_CLIENTES=1 religa). Quem já ativou continua vendo e usando. */
export const mfaDisponivel = (u: { papel: string; mfa_ativo: boolean }) => u.papel === 'admin' || u.mfa_ativo || process.env.MFA_CLIENTES === '1';
