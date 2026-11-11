import { timingSafeEqual } from 'node:crypto';
import { query } from '../db';
import { AppError, type Actor } from '../errors';
import { registrar } from './auditoria';
import { aplicaNaCompetencia, competenciaSchema } from './documentos';
import { cobrarDocumentos } from './cobranca';

/* Integração com o n8n (cobrança de extratos pelo WhatsApp/Digisac). Acesso só com "Authorization: Bearer <senha>".
   A senha é INTEGRACAO_TOKEN ou, se não existir, a mesma do fluxo da conciliação (N8N_CONCILIACAO_TOKEN), já cadastrada no Render. */

export function autorizado(req: Request) {
  const segredo = process.env.INTEGRACAO_TOKEN || process.env.N8N_CONCILIACAO_TOKEN;
  if (!segredo || segredo.length < 24) return 'sem-token' as const;
  const recebido = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(recebido), b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b) ? ('ok' as const) : ('negado' as const);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const mesPorExtenso = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;

export type ExtratoFaltando = { documento: string; banco: string | null; situacao: 'pendente' | 'rejeitado'; motivo: string | null };
/** Empresas ativas com extrato obrigatório do mês ainda não enviado (ou recusado), com o WhatsApp e a mensagem pronta. */
export async function extratosPendentes(competencia: string) {
  competenciaSchema.parse(competencia);
  const { rows } = await query(
    `SELECT e.id, e.razao_social, e.nome_fantasia, e.whatsapp, x.nome, x.instituicao, x.frequencia, COALESCE(a.situacao,'pendente') situacao, a.motivo_rejeicao,
            (SELECT u.nome FROM usuario_empresas ue JOIN usuarios u ON u.id=ue.usuario_id AND u.ativo AND u.papel='cliente' WHERE ue.empresa_id=e.id ORDER BY u.criado_em LIMIT 1) contato
       FROM empresas e JOIN exigencias x ON x.empresa_id=e.id AND x.ativo AND x.obrigatorio AND (x.nome || ' ' || coalesce(x.categoria,'')) ~* 'extrato'
       LEFT JOIN LATERAL (SELECT situacao, motivo_rejeicao FROM arquivos WHERE exigencia_id=x.id AND competencia=$1 AND situacao<>'substituido' ORDER BY versao DESC LIMIT 1) a ON true
      WHERE e.situacao='ativa' ORDER BY e.razao_social, x.nome`, [competencia]);
  const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const porEmpresa = new Map<string, { empresaId: string; empresa: string; whatsapp: string | null; contato: string | null; faltam: ExtratoFaltando[] }>();
  for (const r of rows) {
    if (!aplicaNaCompetencia(r.frequencia, competencia) || (r.situacao !== 'pendente' && r.situacao !== 'rejeitado')) continue;
    const e = porEmpresa.get(r.id) ?? { empresaId: r.id as string, empresa: (r.nome_fantasia || r.razao_social) as string, whatsapp: r.whatsapp as string | null, contato: r.contato as string | null, faltam: [] as ExtratoFaltando[] };
    e.faltam.push({ documento: r.nome, banco: r.instituicao, situacao: r.situacao, motivo: r.motivo_rejeicao }); porEmpresa.set(r.id, e);
  }
  const mes = mesPorExtenso(competencia);
  const empresas = [...porEmpresa.values()].map((e) => {
    const nome = e.contato ? e.contato.trim().split(/\s+/)[0] : '';
    const linhas = e.faltam.map((f) => `• ${f.documento}${f.banco && !f.documento.toLowerCase().includes(f.banco.toLowerCase()) ? ` (${f.banco})` : ''}${f.situacao === 'rejeitado' ? ` — precisa enviar de novo${f.motivo ? `: ${f.motivo}` : ''}` : ''}`);
    const link = base ? `${base}/cliente/${e.empresaId}/documentos?competencia=${competencia}` : null;
    const mensagem = [`Olá${nome ? `, ${nome}` : ''}! Tudo bem? 😊`, '', `Aqui é da Contvoo Contabilidade. Para fecharmos ${mes} da ${e.empresa}, ainda falta${e.faltam.length > 1 ? 'm' : ''} ${e.faltam.length > 1 ? 'os extratos' : 'o extrato'}:`, ...linhas, '',
      link ? `É só enviar pelo painel: ${link}` : 'É só enviar pelo Painel do Cliente, em "Documentos do mês".', '', 'Obrigado!'].join('\n');
    return { ...e, link, mensagem };
  });
  return { competencia, mes, comWhatsapp: empresas.filter((e) => e.whatsapp), semWhatsapp: empresas.filter((e) => !e.whatsapp).map((e) => ({ empresaId: e.empresaId, empresa: e.empresa })) };
}

/** O n8n avisa que mandou (ou não conseguiu mandar) a mensagem: fica na auditoria e, se enviada, vira a cobrança no painel do cliente ("Cobrado Nx"). */
export async function registrarCobrancaEnviada(p: { empresaId: string; competencia: string; enviada: boolean; detalhe?: string }) {
  competenciaSchema.parse(p.competencia);
  const emp = (await query(`SELECT id, responsavel_id FROM empresas WHERE id=$1`, [p.empresaId])).rows[0];
  if (!emp) throw new AppError('Empresa não encontrada.', 'nao_encontrado');
  const adminId = emp.responsavel_id ?? (await query(`SELECT id FROM usuarios WHERE papel='admin' AND ativo ORDER BY criado_em LIMIT 1`)).rows[0]?.id;
  if (!adminId) throw new AppError('Nenhum administrador ativo.');
  const actor: Actor = { id: adminId, papel: 'admin' };
  await registrar({ query } as never, { usuarioId: adminId, empresaId: emp.id, acao: p.enviada ? 'cobranca.whatsapp_enviada' : 'cobranca.whatsapp_falhou', entidade: 'empresa', entidadeId: emp.id,
    detalhes: { competencia: p.competencia, canal: 'digisac', detalhe: (p.detalhe ?? '').slice(0, 300) || null } });
  if (!p.enviada) return { registrada: true, cobranca: false };
  try { await cobrarDocumentos(actor, emp.id, p.competencia); } catch (e) { if (!(e instanceof AppError)) throw e; }
  return { registrada: true, cobranca: true };
}
