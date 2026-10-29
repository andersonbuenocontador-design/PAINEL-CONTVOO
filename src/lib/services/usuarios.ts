import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { registrar } from './auditoria';
import { problemaDaSenha } from '../senha';
import { ipBloqueado, registrarFalhaIp, type UsuarioLogin } from './seguranca';

const COST = process.env.NODE_ENV === 'test' ? 4 : 12;
const LIMITE_FALHAS = 5;
const BLOQUEIO_MIN = 15;

export const senhaSchema = z.string().superRefine((s, ctx) => { const p = problemaDaSenha(s); if (p) ctx.addIssue({ code: 'custom', message: p }); });

export type UsuarioSessao = { id: string; nome: string; email: string; papel: 'admin' | 'cliente'; deve_trocar_senha: boolean; token_version: number; mfa_ativo: boolean };

/** `ip` (opcional): limita tentativas por endereço. Devolve `mfa_ativo`: se true, falta o 2º passo (verificarSegundoFator) antes de abrir a sessão. */
export async function autenticar(email: string, senha: string, ip?: string): Promise<UsuarioLogin> {
  const generico = new AppError('E-mail ou senha inválidos.', 'auth');
  if (ip && (await ipBloqueado(ip))) throw new AppError('Muitas tentativas deste endereço. Aguarde alguns minutos e tente de novo.', 'auth');
  const { rows } = await query('SELECT * FROM usuarios WHERE lower(email)=lower($1)', [email.trim()]);
  const u = rows[0];
  if (!u) { await bcrypt.compare(senha, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'); if (ip) await registrarFalhaIp(ip); throw generico; }
  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) throw new AppError('Acesso temporariamente bloqueado. Tente novamente mais tarde.', 'auth');
  const ok = await bcrypt.compare(senha, u.senha_hash);
  if (!ok || !u.ativo) {
    if (!ok) {
      if (ip) await registrarFalhaIp(ip);
      await tx(async (c) => {
        const r = await c.query(
          `UPDATE usuarios SET falhas_login=falhas_login+1,
             bloqueado_ate = CASE WHEN falhas_login+1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE bloqueado_ate END
           WHERE id=$1 RETURNING falhas_login`, [u.id, LIMITE_FALHAS, String(BLOQUEIO_MIN)]);
        await registrar(c, { usuarioId: u.id, acao: 'login.falha', entidade: 'usuario', entidadeId: u.id, detalhes: { falhas: r.rows[0].falhas_login } });
      });
    }
    throw generico;
  }
  await tx(async (c) => {
    await c.query('UPDATE usuarios SET falhas_login=0, bloqueado_ate=NULL WHERE id=$1', [u.id]);
    await registrar(c, { usuarioId: u.id, acao: 'login.sucesso', entidade: 'usuario', entidadeId: u.id });
  });
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, deve_trocar_senha: u.deve_trocar_senha, token_version: u.token_version, mfa_ativo: !!u.mfa_ativo };
}

export async function buscarUsuarioSessao(id: string, tv: number): Promise<UsuarioSessao | null> {
  const { rows } = await query('SELECT id,nome,email,papel,deve_trocar_senha,token_version,mfa_ativo FROM usuarios WHERE id=$1 AND ativo AND token_version=$2', [id, tv]);
  return rows[0] ?? null;
}

const novoUsuario = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.'),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  papel: z.enum(['admin', 'cliente']),
  senhaTemporaria: senhaSchema,
  empresaIds: z.array(z.string().uuid()).default([]),
});

export async function criarUsuario(actor: Actor, input: z.input<typeof novoUsuario>) {
  exigirAdmin(actor);
  const d = novoUsuario.parse(input);
  { const p = problemaDaSenha(d.senhaTemporaria, d.email); if (p) throw new AppError(p); }
  const hash = await bcrypt.hash(d.senhaTemporaria, COST);
  return tx(async (c) => {
    try {
      const r = await c.query(
        `INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ($1,$2,$3,$4) RETURNING id`, [d.nome, d.email, hash, d.papel]);
      const id = r.rows[0].id as string;
      if (d.papel === 'cliente') {
        for (const e of d.empresaIds) {
          await c.query('INSERT INTO usuario_empresas(usuario_id,empresa_id,criado_por) VALUES ($1,$2,$3)', [id, e, actor.id]);
        }
      }
      await registrar(c, { usuarioId: actor.id, acao: 'usuario.criar', entidade: 'usuario', entidadeId: id, detalhes: { papel: d.papel, empresas: d.empresaIds } });
      return id;
    } catch (e: any) {
      if (e.code === '23505') throw new AppError('Já existe um usuário com esse e-mail.', 'conflito');
      if (e.code === '23503') throw new AppError('Empresa informada não existe.', 'validacao');
      throw e;
    }
  });
}

export async function listarUsuarios(actor: Actor) {
  exigirAdmin(actor);
  const { rows } = await query(
    `SELECT u.id,u.nome,u.email,u.papel,u.ativo,u.receber_emails,u.mfa_ativo,u.criado_em,
            COALESCE(json_agg(json_build_object('id',e.id,'razao_social',e.razao_social) ORDER BY e.razao_social) FILTER (WHERE e.id IS NOT NULL),'[]') AS empresas
       FROM usuarios u LEFT JOIN usuario_empresas ue ON ue.usuario_id=u.id LEFT JOIN empresas e ON e.id=ue.empresa_id
      GROUP BY u.id ORDER BY u.nome`);
  return rows;
}

export async function definirAtivo(actor: Actor, usuarioId: string, ativo: boolean) {
  exigirAdmin(actor);
  if (actor.id === usuarioId && !ativo) throw new AppError('Você não pode desativar o próprio acesso.');
  await tx(async (c) => {
    const r = await c.query('UPDATE usuarios SET ativo=$2, token_version=token_version+1, atualizado_em=now() WHERE id=$1 RETURNING id', [usuarioId, ativo]);
    if (!r.rowCount) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, acao: ativo ? 'usuario.reativar' : 'usuario.bloquear', entidade: 'usuario', entidadeId: usuarioId });
  });
}

export async function vincular(actor: Actor, usuarioId: string, empresaId: string, vincularOuNao: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const u = await c.query('SELECT papel FROM usuarios WHERE id=$1', [usuarioId]);
    if (!u.rowCount) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
    if (u.rows[0].papel !== 'cliente') throw new AppError('Apenas usuários do tipo cliente são vinculados a empresas.');
    if (vincularOuNao) {
      try { await c.query('INSERT INTO usuario_empresas(usuario_id,empresa_id,criado_por) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [usuarioId, empresaId, actor.id]); }
      catch (e: any) { if (e.code === '23503') throw new AppError('Empresa não encontrada.', 'nao_encontrado'); throw e; }
    } else {
      await c.query('DELETE FROM usuario_empresas WHERE usuario_id=$1 AND empresa_id=$2', [usuarioId, empresaId]);
    }
    await registrar(c, { usuarioId: actor.id, empresaId, acao: vincularOuNao ? 'usuario.vincular' : 'usuario.desvincular', entidade: 'usuario', entidadeId: usuarioId });
  });
}

export async function redefinirSenha(actor: Actor, usuarioId: string, senhaTemporaria: string) {
  exigirAdmin(actor);
  const hash = await bcrypt.hash(senhaSchema.parse(senhaTemporaria), COST);
  await tx(async (c) => {
    const r = await c.query(
      `UPDATE usuarios SET senha_hash=$2, deve_trocar_senha=true, token_version=token_version+1, falhas_login=0, bloqueado_ate=NULL, atualizado_em=now() WHERE id=$1 RETURNING id`, [usuarioId, hash]);
    if (!r.rowCount) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, acao: 'usuario.redefinir_senha', entidade: 'usuario', entidadeId: usuarioId });
  });
}

export async function trocarSenha(usuarioId: string, atual: string, nova: string): Promise<number> {
  const n = senhaSchema.parse(nova);
  const { rows } = await query('SELECT senha_hash,email FROM usuarios WHERE id=$1 AND ativo', [usuarioId]);
  { const p = rows[0] ? problemaDaSenha(n, rows[0].email) : null; if (p) throw new AppError(p); }
  if (!rows[0] || !(await bcrypt.compare(atual, rows[0].senha_hash))) throw new AppError('Senha atual incorreta.', 'auth');
  if (atual === n) throw new AppError('A nova senha deve ser diferente da atual.');
  const hash = await bcrypt.hash(n, COST);
  return tx(async (c) => {
    const r = await c.query('UPDATE usuarios SET senha_hash=$2, deve_trocar_senha=false, token_version=token_version+1, atualizado_em=now() WHERE id=$1 RETURNING token_version', [usuarioId, hash]);
    await registrar(c, { usuarioId, acao: 'usuario.trocar_senha', entidade: 'usuario', entidadeId: usuarioId });
    return r.rows[0].token_version as number;
  });
}

export async function definirReceberEmails(actor: Actor, usuarioId: string, valor: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE usuarios SET receber_emails=$2, atualizado_em=now() WHERE id=$1 RETURNING id', [usuarioId, valor]);
    if (!r.rowCount) throw new AppError('Usuário não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, acao: valor ? 'usuario.ativar_emails' : 'usuario.desativar_emails', entidade: 'usuario', entidadeId: usuarioId });
  });
}
