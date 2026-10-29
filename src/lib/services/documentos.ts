import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPool, query, tx } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { gravar, ler } from '../storage';
import { obterEmpresa } from './empresas';
import { registrar } from './auditoria';

export const FREQUENCIAS = ['mensal', 'trimestral', 'anual', 'eventual'] as const;
export const FORMATOS_PERMITIDOS = ['pdf', 'ofx', 'csv', 'xlsx', 'xls', 'zip', 'xml', 'jpg', 'png'] as const;
export const TAMANHO_MAX = 20 * 1024 * 1024;
export const SITUACOES = ['pendente', 'enviado', 'em_conferencia', 'aprovado', 'rejeitado', 'substituido'] as const;

export const competenciaSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competência inválida.');
const vazio = (s?: string | null) => (s && s.trim() ? s.trim() : null);

const itemSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do documento.'),
  instituicao: z.string().optional().transform(vazio),
  categoria: z.string().optional().transform(vazio),
  formatos: z.array(z.enum(FORMATOS_PERMITIDOS)).min(1, 'Escolha ao menos um formato.'),
  obrigatorio: z.boolean().default(true),
  frequencia: z.enum(FREQUENCIAS).default('mensal'),
  instrucoes: z.string().optional().transform(vazio),
  diaPrazo: z.coerce.number().int().min(1).max(31).nullish().transform((v) => v ?? null),
});
export type ItemInput = z.input<typeof itemSchema>;

/** A exigência vale na competência? (mensal: sempre; trimestral: mar/jun/set/dez; anual: dez; eventual: nunca é cobrada) */
export function aplicaNaCompetencia(freq: string, comp: string) {
  const m = Number(comp.slice(5));
  return freq === 'mensal' || (freq === 'trimestral' && m % 3 === 0) || (freq === 'anual' && m === 12);
}

/* ---------- Exigências por empresa ---------- */
export async function criarExigencia(actor: Actor, empresaId: string, input: ItemInput) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  const d = itemSchema.parse(input);
  return tx(async (c) => {
    try {
      const r = await c.query(
        `INSERT INTO exigencias(empresa_id,nome,instituicao,categoria,formatos,obrigatorio,frequencia,instrucoes,dia_prazo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [empresaId, d.nome, d.instituicao, d.categoria, d.formatos, d.obrigatorio, d.frequencia, d.instrucoes, d.diaPrazo]);
      await registrar(c, { usuarioId: actor.id, empresaId, acao: 'exigencia.criar', entidade: 'exigencia', entidadeId: r.rows[0].id });
      return r.rows[0].id as string;
    } catch (e: any) { if (e.code === '23505') throw new AppError('Essa empresa já tem esse documento (mesmo nome e instituição).', 'conflito'); throw e; }
  });
}
export async function editarExigencia(actor: Actor, id: string, input: ItemInput) {
  exigirAdmin(actor); const d = itemSchema.parse(input);
  await tx(async (c) => {
    try {
      const r = await c.query(
        `UPDATE exigencias SET nome=$2,instituicao=$3,categoria=$4,formatos=$5,obrigatorio=$6,frequencia=$7,instrucoes=$8,dia_prazo=$9 WHERE id=$1 RETURNING empresa_id`,
        [id, d.nome, d.instituicao, d.categoria, d.formatos, d.obrigatorio, d.frequencia, d.instrucoes, d.diaPrazo]);
      if (!r.rowCount) throw new AppError('Documento não encontrado.', 'nao_encontrado');
      await registrar(c, { usuarioId: actor.id, empresaId: r.rows[0].empresa_id, acao: 'exigencia.editar', entidade: 'exigencia', entidadeId: id });
    } catch (e: any) { if (e.code === '23505') throw new AppError('Essa empresa já tem esse documento (mesmo nome e instituição).', 'conflito'); throw e; }
  });
}
/** Desativar nunca apaga: arquivos e histórico permanecem. */
export async function definirExigenciaAtiva(actor: Actor, id: string, ativo: boolean) {
  exigirAdmin(actor);
  await tx(async (c) => {
    const r = await c.query('UPDATE exigencias SET ativo=$2 WHERE id=$1 RETURNING empresa_id', [id, ativo]);
    if (!r.rowCount) throw new AppError('Documento não encontrado.', 'nao_encontrado');
    await registrar(c, { usuarioId: actor.id, empresaId: r.rows[0].empresa_id, acao: ativo ? 'exigencia.ativar' : 'exigencia.desativar', entidade: 'exigencia', entidadeId: id });
  });
}
export async function listarExigencias(actor: Actor, empresaId: string) {
  exigirAdmin(actor);
  return (await query('SELECT * FROM exigencias WHERE empresa_id=$1 ORDER BY ativo DESC, nome', [empresaId])).rows;
}

/* ---------- Modelos reutilizáveis ---------- */
export async function criarModeloDeEmpresa(actor: Actor, nome: string, empresaId: string) {
  exigirAdmin(actor); await obterEmpresa(actor, empresaId);
  const n = z.string().trim().min(2, 'Informe o nome do modelo.').parse(nome);
  return tx(async (c) => {
    try {
      const m = await c.query('INSERT INTO modelos_documento(nome,criado_por) VALUES ($1,$2) RETURNING id', [n, actor.id]);
      const r = await c.query(
        `INSERT INTO modelo_itens(modelo_id,nome,instituicao,categoria,formatos,obrigatorio,frequencia,instrucoes,dia_prazo)
         SELECT $1,nome,instituicao,categoria,formatos,obrigatorio,frequencia,instrucoes,dia_prazo FROM exigencias WHERE empresa_id=$2 AND ativo`, [m.rows[0].id, empresaId]);
      if (!r.rowCount) throw new AppError('A empresa não tem documentos ativos para virar modelo.');
      await registrar(c, { usuarioId: actor.id, empresaId, acao: 'modelo.criar', entidade: 'modelo', entidadeId: m.rows[0].id, detalhes: { itens: r.rowCount } });
      return m.rows[0].id as string;
    } catch (e: any) { if (e.code === '23505') throw new AppError('Já existe um modelo com esse nome.', 'conflito'); throw e; }
  });
}
export async function listarModelos(actor: Actor) {
  exigirAdmin(actor);
  return (await query(`SELECT m.id,m.nome,json_agg(json_build_object('nome',i.nome,'instituicao',i.instituicao,'frequencia',i.frequencia) ORDER BY i.nome) itens
    FROM modelos_documento m LEFT JOIN modelo_itens i ON i.modelo_id=m.id GROUP BY m.id ORDER BY m.nome`)).rows;
}
/** Aplica o modelo SEM sobrescrever: documentos que a empresa já tem (mesmo nome+instituição) são mantidos e informados. */
export async function aplicarModelo(actor: Actor, modeloId: string, empresaIds: string[]) {
  exigirAdmin(actor);
  const res = { criados: 0, ignorados: 0 };
  await tx(async (c) => {
    if (!(await c.query('SELECT 1 FROM modelos_documento WHERE id=$1', [modeloId])).rowCount) throw new AppError('Modelo não encontrado.', 'nao_encontrado');
    for (const e of empresaIds) {
      if (!(await c.query('SELECT 1 FROM empresas WHERE id=$1', [e])).rowCount) throw new AppError('Empresa não encontrada.', 'nao_encontrado');
      const ins = await c.query(
        `INSERT INTO exigencias(empresa_id,nome,instituicao,categoria,formatos,obrigatorio,frequencia,instrucoes,dia_prazo)
         SELECT $2,nome,instituicao,categoria,formatos,obrigatorio,frequencia,instrucoes,dia_prazo FROM modelo_itens WHERE modelo_id=$1 ON CONFLICT DO NOTHING`, [modeloId, e]);
      const total = (await c.query('SELECT count(*)::int n FROM modelo_itens WHERE modelo_id=$1', [modeloId])).rows[0].n;
      res.criados += ins.rowCount ?? 0; res.ignorados += total - (ins.rowCount ?? 0);
      await registrar(c, { usuarioId: actor.id, empresaId: e, acao: 'modelo.aplicar', entidade: 'modelo', entidadeId: modeloId, detalhes: { criados: ins.rowCount } });
    }
  });
  return res;
}

/* ---------- Situação por competência ---------- */
export async function situacaoCompetencia(actor: Actor, empresaId: string, competencia: string) {
  const emp = await obterEmpresa(actor, empresaId); // controla o acesso (cliente só vê a própria)
  competenciaSchema.parse(competencia);
  const { rows } = await query(
    `SELECT x.id exigencia_id, x.nome, x.instituicao, x.categoria, x.formatos, x.obrigatorio, x.frequencia, x.instrucoes, x.dia_prazo,
            a.id arquivo_id, a.versao, a.nome_original, a.situacao, a.motivo_rejeicao, a.enviado_em
       FROM exigencias x
       LEFT JOIN LATERAL (SELECT * FROM arquivos WHERE exigencia_id=x.id AND competencia=$2 ORDER BY versao DESC LIMIT 1) a ON true
      WHERE x.empresa_id=$1 AND x.ativo ORDER BY x.nome`, [emp.id, competencia]);
  const itens = rows.filter((r) => aplicaNaCompetencia(r.frequencia, competencia) || r.arquivo_id)
    .map((r) => ({ ...r, situacao: (r.situacao ?? 'pendente') as (typeof SITUACOES)[number] }));
  return { itens, indicadores: indicadores(itens) };
}
export function indicadores(itens: { obrigatorio: boolean; situacao: string }[]) {
  const ob = itens.filter((i) => i.obrigatorio);
  const n = (f: (i: { situacao: string }) => boolean) => ob.filter(f).length;
  const aprovados = n((i) => i.situacao === 'aprovado');
  return {
    exigidos: ob.length, enviados: n((i) => i.situacao !== 'pendente'), aprovados,
    rejeitados: n((i) => i.situacao === 'rejeitado'), pendentes: n((i) => i.situacao === 'pendente'),
    percentual: ob.length ? Math.round((aprovados / ob.length) * 100) : 100,
    // concluída somente quando TODAS as obrigatórias estiverem aprovadas
    concluida: ob.length > 0 && aprovados === ob.length,
  };
}
export async function visaoGeral(actor: Actor, competencia: string) {
  exigirAdmin(actor); competenciaSchema.parse(competencia);
  const { rows } = await query(
    `SELECT e.id,e.razao_social,x.obrigatorio,x.frequencia,COALESCE(a.situacao,'pendente') situacao
       FROM empresas e LEFT JOIN exigencias x ON x.empresa_id=e.id AND x.ativo
       LEFT JOIN LATERAL (SELECT situacao FROM arquivos WHERE exigencia_id=x.id AND competencia=$1 ORDER BY versao DESC LIMIT 1) a ON true
      WHERE e.situacao='ativa' ORDER BY e.razao_social`, [competencia]);
  type Item = { obrigatorio: boolean; situacao: string };
  const m = new Map<string, { id: string; razao_social: string; itens: Item[] }>();
  for (const r of rows) {
    const e = m.get(r.id) ?? { id: r.id, razao_social: r.razao_social, itens: [] as Item[] }; m.set(r.id, e);
    if (r.obrigatorio !== null && aplicaNaCompetencia(r.frequencia, competencia)) e.itens.push({ obrigatorio: r.obrigatorio, situacao: r.situacao });
  }
  return [...m.values()].map((e) => ({ id: e.id, razao_social: e.razao_social, ...indicadores(e.itens) }));
}

/* ---------- Envio, download e conferência ---------- */
export function assinaturaOk(ext: string, b: Buffer) {
  const h = (s: string) => b.subarray(0, s.length).toString('latin1') === s;
  if (ext === 'pdf') return h('%PDF');
  if (['xlsx', 'zip'].includes(ext)) return h('PK');
  if (ext === 'xls') return b[0] === 0xd0 && b[1] === 0xcf;
  if (ext === 'png') return h('\x89PNG');
  if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8;
  return !b.includes(0); // ofx, csv, xml: texto
}
export const nomeSeguro = (n: string) => n.replace(/[\\/\u0000-\u001f"]/g, '_').slice(-180) || 'arquivo';

export async function enviarArquivo(actor: Actor, p: { empresaId: string; exigenciaId: string; competencia: string; nome: string; dados: Buffer }) {
  const emp = await obterEmpresa(actor, p.empresaId); // cliente: só empresa vinculada e ativa
  competenciaSchema.parse(p.competencia);
  const ex = (await query('SELECT * FROM exigencias WHERE id=$1 AND empresa_id=$2 AND ativo', [p.exigenciaId, emp.id])).rows[0];
  if (!ex) throw new AppError('Documento não encontrado.', 'nao_encontrado');
  if (!p.dados.length) throw new AppError('O arquivo está vazio.');
  if (p.dados.length > TAMANHO_MAX) throw new AppError('Arquivo maior que 20 MB.');
  const ext = (p.nome.split('.').pop() ?? '').toLowerCase();
  if (!ex.formatos.includes(ext)) throw new AppError(`Formato não aceito para este documento. Aceitos: ${ex.formatos.join(', ').toUpperCase()}.`);
  if (!assinaturaOk(ext, p.dados)) throw new AppError('O conteúdo do arquivo não corresponde ao formato informado.');
  const chave = `${emp.id}/${randomUUID()}`;
  const sha = createHash('sha256').update(p.dados).digest('hex');
  await gravar(chave, p.dados);
  return tx(async (c) => {
    // trava a exigência+competência para evitar duas versões concorrentes
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${ex.id}:${p.competencia}`]);
    const atual = (await c.query('SELECT id,versao,situacao FROM arquivos WHERE exigencia_id=$1 AND competencia=$2 ORDER BY versao DESC LIMIT 1', [ex.id, p.competencia])).rows[0];
    if (atual?.situacao === 'aprovado' && actor.papel === 'cliente') throw new AppError('Este documento já foi aprovado pelo escritório. Fale com o escritório para alterá-lo.');
    if (atual) await c.query(`UPDATE arquivos SET situacao='substituido' WHERE id=$1 AND situacao<>'substituido'`, [atual.id]);
    const r = await c.query(
      `INSERT INTO arquivos(empresa_id,exigencia_id,competencia,versao,nome_original,chave_storage,tamanho,sha256,enviado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [emp.id, ex.id, p.competencia, (atual?.versao ?? 0) + 1, nomeSeguro(p.nome), chave, p.dados.length, sha, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: emp.id, acao: 'arquivo.enviar', entidade: 'arquivo', entidadeId: r.rows[0].id, detalhes: { exigencia: ex.id, competencia: p.competencia, versao: (atual?.versao ?? 0) + 1 } });
    return r.rows[0].id as string;
  });
}

export async function historicoVersoes(actor: Actor, empresaId: string, exigenciaId: string, competencia: string) {
  const emp = await obterEmpresa(actor, empresaId);
  return (await query(
    `SELECT a.id,a.versao,a.nome_original,a.situacao,a.motivo_rejeicao,a.enviado_em,u.nome enviado_por FROM arquivos a JOIN usuarios u ON u.id=a.enviado_por
      WHERE a.empresa_id=$1 AND a.exigencia_id=$2 AND a.competencia=$3 ORDER BY a.versao DESC`, [emp.id, exigenciaId, competencia])).rows;
}

export async function baixarArquivo(actor: Actor, arquivoId: string) {
  if (!z.string().uuid().safeParse(arquivoId).success) throw new AppError('Arquivo não encontrado.', 'nao_encontrado');
  const a = (await query('SELECT * FROM arquivos WHERE id=$1', [arquivoId])).rows[0];
  if (!a) throw new AppError('Arquivo não encontrado.', 'nao_encontrado');
  await obterEmpresa(actor, a.empresa_id); // mesma regra de acesso da empresa; mesma resposta se não for sua
  if (a.descartado_em) throw new AppError('Este arquivo foi descartado conforme a política de retenção de dados.', 'nao_encontrado');
  const dados = await ler(a.chave_storage);
  await registrar(getPool(), { usuarioId: actor.id, empresaId: a.empresa_id, acao: 'arquivo.baixar', entidade: 'arquivo', entidadeId: a.id });
  return { dados, nome: a.nome_original as string };
}

export async function conferirArquivo(actor: Actor, arquivoId: string, decisao: 'em_conferencia' | 'aprovado' | 'rejeitado', motivo?: string) {
  exigirAdmin(actor);
  const m = (motivo ?? '').trim();
  if (decisao === 'rejeitado' && !m) throw new AppError('Informe o motivo da rejeição.');
  await tx(async (c) => {
    const a = (await c.query('SELECT * FROM arquivos WHERE id=$1 FOR UPDATE', [arquivoId])).rows[0];
    if (!a) throw new AppError('Arquivo não encontrado.', 'nao_encontrado');
    const ultima = (await c.query('SELECT max(versao) v FROM arquivos WHERE exigencia_id=$1 AND competencia=$2', [a.exigencia_id, a.competencia])).rows[0].v;
    if (a.versao !== ultima || a.situacao === 'substituido') throw new AppError('Só a versão mais recente pode ser conferida.');
    await c.query(`UPDATE arquivos SET situacao=$2, motivo_rejeicao=$3, conferido_por=$4, conferido_em=now() WHERE id=$1`, [arquivoId, decisao, decisao === 'rejeitado' ? m : null, actor.id]);
    await registrar(c, { usuarioId: actor.id, empresaId: a.empresa_id, acao: `arquivo.${decisao}`, entidade: 'arquivo', entidadeId: arquivoId, detalhes: decisao === 'rejeitado' ? { motivo: m } : {} });
  });
}
