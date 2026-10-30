import { z } from 'zod';
import { query, tx } from '../db';
import { cnpjValido, soDigitos } from '../cnpj';
import { Actor, AppError, exigirAdmin } from '../errors';
import { registrar } from './auditoria';

const vazioParaNull = (s?: string | null) => (s && s.trim() ? s.trim() : null);

const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(2, 'Informe a razão social.'),
  nomeFantasia: z.string().optional().transform(vazioParaNull),
  cnpj: z.string().refine(cnpjValido, 'CNPJ inválido.').transform(soDigitos),
  emailContato: z.string().optional().transform(vazioParaNull).refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail de contato inválido.'),
  responsavelId: z.string().uuid().nullish().transform((v) => v ?? null),
  inicioUso: z.string().optional().transform(vazioParaNull).refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida.'),
});
export type EmpresaInput = z.input<typeof empresaSchema>;

export async function criarEmpresa(actor: Actor, input: EmpresaInput) {
  exigirAdmin(actor);
  const d = empresaSchema.parse(input);
  return tx(async (c) => {
    try {
      const r = await c.query(
        `INSERT INTO empresas(razao_social,nome_fantasia,cnpj,email_contato,responsavel_id,inicio_uso) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [d.razaoSocial, d.nomeFantasia, d.cnpj, d.emailContato, d.responsavelId, d.inicioUso]);
      const id = r.rows[0].id as string;
      await registrar(c, { usuarioId: actor.id, empresaId: id, acao: 'empresa.criar', entidade: 'empresa', entidadeId: id, detalhes: { cnpj: d.cnpj } });
      await (await import('./conciliacao')).garantirPlanoGenerico(c, id); // toda empresa nova já nasce com o plano genérico de categorias
      return id;
    } catch (e: any) {
      if (e.code === '23505') throw new AppError('Já existe uma empresa cadastrada com esse CNPJ.', 'conflito');
      if (e.code === '23503') throw new AppError('Responsável informado não existe.');
      throw e;
    }
  });
}

export async function editarEmpresa(actor: Actor, id: string, input: EmpresaInput) {
  exigirAdmin(actor);
  const d = empresaSchema.parse(input);
  await tx(async (c) => {
    try {
      const r = await c.query(
        `UPDATE empresas SET razao_social=$2,nome_fantasia=$3,cnpj=$4,email_contato=$5,responsavel_id=$6,inicio_uso=$7,atualizado_em=now() WHERE id=$1 RETURNING id`,
        [id, d.razaoSocial, d.nomeFantasia, d.cnpj, d.emailContato, d.responsavelId, d.inicioUso]);
      if (!r.rowCount) throw new AppError('Empresa não encontrada.', 'nao_encontrado');
      await registrar(c, { usuarioId: actor.id, empresaId: id, acao: 'empresa.editar', entidade: 'empresa', entidadeId: id });
    } catch (e: any) {
      if (e.code === '23505') throw new AppError('Já existe outra empresa com esse CNPJ.', 'conflito');
      throw e;
    }
  });
}

/** Desativar NUNCA apaga documentos nem histórico: apenas muda a situação. */
export async function definirSituacao(actor: Actor, id: string, situacao: 'ativa' | 'inativa') {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE empresas SET situacao=$2, atualizado_em=now() WHERE id=$1 RETURNING id', [id, situacao]);
    if (!r.rowCount) throw new AppError('Empresa não encontrada.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, empresaId: id, acao: `empresa.${situacao === 'ativa' ? 'ativar' : 'desativar'}`, entidade: 'empresa', entidadeId: id });
  });
}

const COLS = `e.id,e.razao_social,e.nome_fantasia,e.cnpj,e.email_contato,e.responsavel_id,e.situacao,e.inicio_uso,e.criado_em`;

/** Admin vê todas; cliente só as empresas explicitamente vinculadas a ele (e ativas). */
export async function listarEmpresas(actor: Actor, busca?: string) {
  const termo = busca?.trim();
  const params: unknown[] = [];
  const where: string[] = [];
  let join = '';
  if (actor.papel === 'cliente') {
    params.push(actor.id);
    join = `JOIN usuario_empresas ue ON ue.empresa_id=e.id AND ue.usuario_id=$${params.length}`;
    where.push(`e.situacao='ativa'`);
  }
  if (termo) {
    params.push(`%${termo.replace(/[\\%_]/g, '\\$&')}%`);
    const p = params.length;
    const dig = soDigitos(termo);
    let cond = `e.razao_social ILIKE $${p} OR e.nome_fantasia ILIKE $${p}`;
    if (dig) { params.push(`%${dig}%`); cond += ` OR e.cnpj LIKE $${params.length}`; }
    where.push(`(${cond})`);
  }
  const { rows } = await query(`SELECT ${COLS} FROM empresas e ${join} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.razao_social`, params);
  return rows;
}

/** Verificação central de acesso: toda leitura de dados de uma empresa deve passar por aqui. */
export async function obterEmpresa(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError('Empresa não encontrada.', 'nao_encontrado');
  const params: unknown[] = [id];
  let join = '';
  let extra = '';
  if (actor.papel === 'cliente') {
    params.push(actor.id);
    join = 'JOIN usuario_empresas ue ON ue.empresa_id=e.id AND ue.usuario_id=$2';
    extra = `AND e.situacao='ativa'`;
  }
  const { rows } = await query(`SELECT ${COLS} FROM empresas e ${join} WHERE e.id=$1 ${extra}`, params);
  // Mesma resposta para "não existe" e "não é sua": não revela a existência de outras empresas.
  if (!rows[0]) throw new AppError('Empresa não encontrada.', 'nao_encontrado');
  return rows[0];
}

export async function usuariosDaEmpresa(actor: Actor, empresaId: string) {
  exigirAdmin(actor);
  const { rows } = await query(
    `SELECT u.id,u.nome,u.email,u.ativo FROM usuarios u JOIN usuario_empresas ue ON ue.usuario_id=u.id WHERE ue.empresa_id=$1 ORDER BY u.nome`, [empresaId]);
  return rows;
}
