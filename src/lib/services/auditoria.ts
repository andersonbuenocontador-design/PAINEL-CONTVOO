import type pg from 'pg';
import { query } from '../db';
import { Actor, exigirAdmin } from '../errors';

type Runner = Pick<pg.PoolClient, 'query'>;

export async function registrar(
  r: Runner,
  e: { usuarioId?: string | null; empresaId?: string | null; acao: string; entidade?: string; entidadeId?: string; detalhes?: object },
) {
  await r.query(
    `INSERT INTO auditoria(usuario_id, empresa_id, acao, entidade, entidade_id, detalhes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [e.usuarioId ?? null, e.empresaId ?? null, e.acao, e.entidade ?? null, e.entidadeId ?? null, JSON.stringify(e.detalhes ?? {})],
  );
}

export async function listarAuditoria(actor: Actor, limite = 200) {
  exigirAdmin(actor);
  const { rows } = await query(
    `SELECT a.id, a.criado_em, a.acao, a.entidade, a.entidade_id, a.detalhes, u.nome AS usuario, e.razao_social AS empresa
       FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id LEFT JOIN empresas e ON e.id=a.empresa_id
      ORDER BY a.id DESC LIMIT $1`,
    [Math.min(limite, 1000)],
  );
  return rows;
}
