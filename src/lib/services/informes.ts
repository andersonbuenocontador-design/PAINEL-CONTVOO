import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, tx } from '../db';
import { cpfValido, soDigitos } from '../cnpj';
import { Actor, AppError, exigirAdmin } from '../errors';
import { gravar, ler } from '../storage';
import { assinaturaOk, nomeSeguro, TAMANHO_MAX } from './documentos';
import { obterEmpresa } from './empresas';
import { registrar } from './auditoria';

export const FORMATOS_INFORME = ['pdf', 'xlsx', 'jpg', 'png'] as const;
const vazio = (s?: string | null) => (s && s.trim() ? s.trim() : null);
export const cpfMascarado = (cpf: string) => `***.${cpf.slice(3, 6)}.***-${cpf.slice(9)}`;
export const cpfFormatado = (cpf: string) => cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

/* ---------------- Sócios ---------------- */
const socioSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do sócio.'),
  cpf: z.string().refine(cpfValido, 'CPF inválido.').transform(soDigitos),
  email: z.string().optional().transform(vazio).refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido.'),
  restrito: z.boolean().default(true),
});
export async function criarSocio(actor: Actor, empresaId: string, input: z.input<typeof socioSchema>) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  const d = socioSchema.parse(input);
  return tx(async (c) => {
    try {
      const r = await c.query('INSERT INTO socios(empresa_id,nome,cpf,email,restrito) VALUES ($1,$2,$3,$4,$5) RETURNING id', [empresaId, d.nome, d.cpf, d.email, d.restrito]);
      await registrar(c, { usuarioId: actor.id, empresaId, acao: 'socio.criar', entidade: 'socio', entidadeId: r.rows[0].id });
      return r.rows[0].id as string;
    } catch (e: any) { if (e.code === '23505') throw new AppError('Já existe um sócio com esse CPF nesta empresa.', 'conflito'); throw e; }
  });
}
export async function editarSocio(actor: Actor, id: string, input: z.input<typeof socioSchema>) {
  exigirAdmin(actor); const d = socioSchema.parse(input);
  await tx(async (c) => {
    try {
      const r = await c.query('UPDATE socios SET nome=$2,cpf=$3,email=$4,restrito=$5 WHERE id=$1 RETURNING empresa_id', [id, d.nome, d.cpf, d.email, d.restrito]);
      if (!r.rowCount) throw new AppError('Sócio não encontrado.', 'nao_encontrado');
      await registrar(c, { usuarioId: actor.id, empresaId: r.rows[0].empresa_id, acao: 'socio.editar', entidade: 'socio', entidadeId: id, detalhes: { restrito: d.restrito } });
    } catch (e: any) { if (e.code === '23505') throw new AppError('Já existe outro sócio com esse CPF nesta empresa.', 'conflito'); throw e; }
  });
}
export async function definirSocioAtivo(actor: Actor, id: string, ativo: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE socios SET ativo=$2 WHERE id=$1 RETURNING empresa_id', [id, ativo]);
    if (!r.rowCount) throw new AppError('Sócio não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, empresaId: r.rows[0].empresa_id, acao: ativo ? 'socio.ativar' : 'socio.desativar', entidade: 'socio', entidadeId: id });
  });
}
/** Autoriza (ou remove) um usuário a ver os informes de um sócio. O usuário precisa ser cliente vinculado à mesma empresa. */
export async function definirAcessoSocio(actor: Actor, socioId: string, usuarioId: string, permitir: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const s = (await c.query('SELECT empresa_id FROM socios WHERE id=$1', [socioId])).rows[0];
    if (!s) throw new AppError('Sócio não encontrado.', 'nao_encontrado');
    if (permitir) {
      const ok = (await c.query(`SELECT 1 FROM usuarios u JOIN usuario_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=$2 WHERE u.id=$1 AND u.papel='cliente' AND u.ativo`, [usuarioId, s.empresa_id])).rowCount;
      if (!ok) throw new AppError('Esse usuário não é um cliente ativo vinculado a esta empresa.');
      await c.query('INSERT INTO socio_usuarios(socio_id,usuario_id,criado_por) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [socioId, usuarioId, actor.id]);
    } else await c.query('DELETE FROM socio_usuarios WHERE socio_id=$1 AND usuario_id=$2', [socioId, usuarioId]);
    await registrar(c, { usuarioId: actor.id, empresaId: s.empresa_id, acao: permitir ? 'socio.autorizar_usuario' : 'socio.remover_usuario', entidade: 'socio', entidadeId: socioId, detalhes: { usuario: usuarioId } });
  });
}
export async function listarSocios(actor: Actor, empresaId: string) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  return (await query(
    `SELECT s.id,s.nome,s.cpf,s.email,s.restrito,s.ativo,
            coalesce(json_agg(json_build_object('id',u.id,'nome',u.nome) ORDER BY u.nome) FILTER (WHERE u.id IS NOT NULL),'[]') AS usuarios
       FROM socios s LEFT JOIN socio_usuarios su ON su.socio_id=s.id LEFT JOIN usuarios u ON u.id=su.usuario_id WHERE s.empresa_id=$1 GROUP BY s.id ORDER BY s.ativo DESC, s.nome`, [empresaId])).rows as
    { id: string; nome: string; cpf: string; email: string | null; restrito: boolean; ativo: boolean; usuarios: { id: string; nome: string }[] }[];
}

/* ---------------- Tipos de documento ---------------- */
export async function listarTipos(_actor: Actor, incluirInativos = false) {
  return (await query(`SELECT id,nome,ativo FROM informe_tipos ${incluirInativos ? '' : 'WHERE ativo'} ORDER BY ordem, nome`)).rows as { id: string; nome: string; ativo: boolean }[];
}
export async function criarTipo(actor: Actor, nome: string) {
  exigirAdmin(actor); const n = z.string().trim().min(2, 'Informe o nome do tipo.').max(100).parse(nome);
  await tx(async (c) => {
    try {
      const r = await c.query('INSERT INTO informe_tipos(nome,ordem) VALUES ($1,(SELECT coalesce(max(ordem),0)+1 FROM informe_tipos)) RETURNING id', [n]);
      await registrar(c, { usuarioId: actor.id, acao: 'informe_tipo.criar', entidade: 'informe_tipo', entidadeId: r.rows[0].id });
    } catch (e: any) { if (e.code === '23505') throw new AppError('Já existe um tipo com esse nome.', 'conflito'); throw e; }
  });
}
export async function definirTipoAtivo(actor: Actor, id: string, ativo: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE informe_tipos SET ativo=$2 WHERE id=$1 RETURNING id', [id, ativo]);
    if (!r.rowCount) throw new AppError('Tipo não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, acao: ativo ? 'informe_tipo.ativar' : 'informe_tipo.desativar', entidade: 'informe_tipo', entidadeId: id });
  });
}

/* ---------------- Informes (escritório) ---------------- */
async function validarArquivo(nome: string, dados: Buffer) {
  if (!dados.length) throw new AppError('O arquivo está vazio.');
  if (dados.length > TAMANHO_MAX) throw new AppError('Arquivo maior que 20 MB.');
  const ext = (nome.split('.').pop() ?? '').toLowerCase();
  if (!(FORMATOS_INFORME as readonly string[]).includes(ext)) throw new AppError(`Formato não aceito. Use: ${FORMATOS_INFORME.join(', ').toUpperCase()}.`);
  if (!assinaturaOk(ext, dados)) throw new AppError('O conteúdo do arquivo não corresponde ao formato informado.');
}
const informeSchema = z.object({
  socioId: z.string().uuid('Escolha o sócio.'), tipoId: z.string().uuid('Escolha o tipo de documento.'),
  ano: z.coerce.number({ message: 'Informe o ano-calendário.' }).int().min(2000, 'Ano inválido.').max(2100, 'Ano inválido.'),
  periodo: z.string().max(60).optional().transform(vazio), descricao: z.string().max(300).optional().transform(vazio), disponibilizar: z.boolean().default(false),
});
export async function criarInforme(actor: Actor, empresaId: string, input: z.input<typeof informeSchema> & { nome: string; dados: Buffer }) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  const d = informeSchema.parse(input); await validarArquivo(input.nome, input.dados);
  const socio = (await query('SELECT ativo FROM socios WHERE id=$1 AND empresa_id=$2', [d.socioId, empresaId])).rows[0];
  if (!socio) throw new AppError('Sócio não encontrado nesta empresa.', 'nao_encontrado');
  if (!socio.ativo) throw new AppError('Este sócio está inativo.');
  if (!(await query('SELECT 1 FROM informe_tipos WHERE id=$1 AND ativo', [d.tipoId])).rowCount) throw new AppError('Tipo de documento inválido.');
  const chave = `informes/${empresaId}/${randomUUID()}`; await gravar(chave, input.dados);
  const sha = createHash('sha256').update(input.dados).digest('hex');
  return tx(async (c) => {
    const r = await c.query(
      `INSERT INTO informes(empresa_id,socio_id,tipo_id,ano_calendario,periodo,descricao,situacao,disponibilizado_em,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [empresaId, d.socioId, d.tipoId, d.ano, d.periodo, d.descricao, d.disponibilizar ? 'disponivel' : 'rascunho', d.disponibilizar ? new Date() : null, actor.id]);
    const id = r.rows[0].id as string;
    await c.query('INSERT INTO informe_versoes(informe_id,versao,nome_original,chave_storage,tamanho,sha256,enviado_por) VALUES ($1,1,$2,$3,$4,$5,$6)', [id, nomeSeguro(input.nome), chave, input.dados.length, sha, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId, acao: 'informe.criar', entidade: 'informe', entidadeId: id, detalhes: { socio: d.socioId, ano: d.ano, disponivel: d.disponibilizar } });
    return id;
  });
}
/** Nova versão do arquivo; as anteriores ficam guardadas no histórico. */
export async function substituirArquivoInforme(actor: Actor, informeId: string, nome: string, dados: Buffer) {
  exigirAdmin(actor); await validarArquivo(nome, dados);
  const inf = (await query('SELECT empresa_id FROM informes WHERE id=$1', [informeId])).rows[0];
  if (!inf) throw new AppError('Informe não encontrado.', 'nao_encontrado');
  const chave = `informes/${inf.empresa_id}/${randomUUID()}`; await gravar(chave, dados);
  const sha = createHash('sha256').update(dados).digest('hex');
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`informe:${informeId}`]);
    const v = (await c.query('SELECT coalesce(max(versao),0)+1 AS n FROM informe_versoes WHERE informe_id=$1', [informeId])).rows[0].n as number;
    await c.query('INSERT INTO informe_versoes(informe_id,versao,nome_original,chave_storage,tamanho,sha256,enviado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)', [informeId, v, nomeSeguro(nome), chave, dados.length, sha, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: inf.empresa_id, acao: 'informe.nova_versao', entidade: 'informe', entidadeId: informeId, detalhes: { versao: v } });
    return v;
  });
}
export async function definirSituacaoInforme(actor: Actor, id: string, situacao: 'disponivel' | 'retirado') {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query(`UPDATE informes SET situacao=$2, disponibilizado_em = CASE WHEN $2='disponivel' THEN now() ELSE disponibilizado_em END WHERE id=$1 RETURNING empresa_id`, [id, situacao]);
    if (!r.rowCount) throw new AppError('Informe não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, empresaId: r.rows[0].empresa_id, acao: situacao === 'disponivel' ? 'informe.disponibilizar' : 'informe.retirar', entidade: 'informe', entidadeId: id });
  });
}
export async function listarInformesAdmin(actor: Actor, empresaId: string) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  return (await query(
    `SELECT i.id,i.ano_calendario,i.periodo,i.descricao,i.situacao,i.disponibilizado_em,s.nome socio,t.nome tipo,
            (SELECT max(versao) FROM informe_versoes WHERE informe_id=i.id) versao_atual,
            (SELECT nome_original FROM informe_versoes WHERE informe_id=i.id ORDER BY versao DESC LIMIT 1) arquivo,
            (SELECT count(*)::int FROM informe_acessos WHERE informe_id=i.id) downloads
       FROM informes i JOIN socios s ON s.id=i.socio_id JOIN informe_tipos t ON t.id=i.tipo_id WHERE i.empresa_id=$1 ORDER BY i.ano_calendario DESC, s.nome, t.nome, i.criado_em DESC`, [empresaId])).rows;
}
export async function historicoInforme(actor: Actor, informeId: string) {
  exigirAdmin(actor);
  if (!z.string().uuid().safeParse(informeId).success) throw new AppError('Informe não encontrado.', 'nao_encontrado');
  const versoes = (await query(`SELECT v.versao,v.nome_original,v.tamanho::text,v.enviado_em,u.nome enviado_por FROM informe_versoes v JOIN usuarios u ON u.id=v.enviado_por WHERE v.informe_id=$1 ORDER BY v.versao DESC`, [informeId])).rows;
  const acessos = (await query(`SELECT a.criado_em,u.nome usuario,u.papel,v.versao FROM informe_acessos a JOIN usuarios u ON u.id=a.usuario_id JOIN informe_versoes v ON v.id=a.versao_id WHERE a.informe_id=$1 ORDER BY a.id DESC LIMIT 100`, [informeId])).rows;
  return { versoes, acessos };
}

/* ---------------- Informes (cliente) ---------------- */
/** Visível ao cliente: empresa vinculada e ativa + informe disponível + sócio ativo + (sócio não restrito OU usuário autorizado para o sócio). */
const VISIVEL = `i.situacao='disponivel' AND s.ativo AND (NOT s.restrito OR EXISTS (SELECT 1 FROM socio_usuarios su WHERE su.socio_id=s.id AND su.usuario_id=$USR))`;
export async function listarInformesCliente(actor: Actor, empresaId: string, ano?: number) {
  const e = await obterEmpresa(actor, empresaId);
  const params: unknown[] = [e.id]; let regra = 'TRUE';
  if (actor.papel !== 'admin') { params.push(actor.id); regra = VISIVEL.replace('$USR', '$2'); }
  let filtroAno = ''; if (ano) { params.push(ano); filtroAno = `AND i.ano_calendario=$${params.length}`; }
  return (await query(
    `SELECT i.id,i.ano_calendario,i.periodo,i.descricao,i.situacao,i.disponibilizado_em,s.nome socio,s.cpf,t.nome tipo,
            (SELECT max(versao) FROM informe_versoes WHERE informe_id=i.id) versao_atual
       FROM informes i JOIN socios s ON s.id=i.socio_id JOIN informe_tipos t ON t.id=i.tipo_id
      WHERE i.empresa_id=$1 AND ${regra} ${filtroAno} ORDER BY i.ano_calendario DESC, s.nome, t.nome`, params)).rows.map((r) => ({ ...r, cpf_mascarado: cpfMascarado(r.cpf as string), cpf: undefined })) as
    { id: string; ano_calendario: number; periodo: string | null; descricao: string | null; situacao: string; disponibilizado_em: string | null; socio: string; tipo: string; versao_atual: number; cpf_mascarado: string }[];
}
/** Download protegido. Cliente: só o que a regra de visibilidade permite, sempre a versão atual. Escritório: qualquer versão (?v). Registra quem baixou. */
export async function baixarInforme(actor: Actor, informeId: string, versao?: number) {
  if (!z.string().uuid().safeParse(informeId).success) throw new AppError('Informe não encontrado.', 'nao_encontrado');
  const inf = (await query('SELECT i.id,i.empresa_id FROM informes i JOIN socios s ON s.id=i.socio_id WHERE i.id=$1', [informeId])).rows[0];
  if (!inf) throw new AppError('Informe não encontrado.', 'nao_encontrado');
  await obterEmpresa(actor, inf.empresa_id);
  if (actor.papel !== 'admin') {
    const ok = (await query(`SELECT 1 FROM informes i JOIN socios s ON s.id=i.socio_id WHERE i.id=$1 AND ${VISIVEL.replace('$USR', '$2')}`, [informeId, actor.id])).rowCount;
    if (!ok) throw new AppError('Informe não encontrado.', 'nao_encontrado'); // mesma resposta de "não existe"
  }
  const v = (await query(`SELECT id,versao,chave_storage,nome_original,descartado_em FROM informe_versoes WHERE informe_id=$1 ${actor.papel === 'admin' && versao ? 'AND versao=$2' : ''} ORDER BY versao DESC LIMIT 1`, actor.papel === 'admin' && versao ? [informeId, versao] : [informeId])).rows[0];
  if (!v) throw new AppError('Arquivo não encontrado.', 'nao_encontrado');
  if (v.descartado_em) throw new AppError('Este arquivo foi descartado conforme a política de retenção de dados.', 'nao_encontrado');
  const dados = await ler(v.chave_storage);
  await tx(async (c) => {
    await c.query(`INSERT INTO informe_acessos(informe_id,versao_id,usuario_id,acao) VALUES ($1,$2,$3,'baixar')`, [informeId, v.id, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: inf.empresa_id, acao: 'informe.baixar', entidade: 'informe', entidadeId: informeId, detalhes: { versao: v.versao } });
  });
  return { dados, nome: v.nome_original as string };
}
