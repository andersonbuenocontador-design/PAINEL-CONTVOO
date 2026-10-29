import type pg from 'pg';
import nodemailer from 'nodemailer';
import { getPool, query, tx } from './db';

type Runner = Pick<pg.PoolClient, 'query'>;
export type EmailProvider = { nome: string; enviar(m: { para: string; assunto: string; texto: string }): Promise<void> };
export const MAX_TENTATIVAS = 5;

const base = () => (process.env.APP_URL ?? '').replace(/\/$/, '');
export const linkPainel = (caminho: string) => `${base()}${caminho}`;

/** Fila (outbox): grava junto com a ação que a originou. `dedup` impede avisos repetidos. O texto NUNCA leva dados da empresa, valores nem documentos. */
export async function enfileirar(r: Runner, n: { destinatarioId: string; empresaId?: string | null; pendenciaId?: string | null; tipo: string; assunto: string; corpo: string; dedup?: string }) {
  await r.query(
    `INSERT INTO notificacoes(destinatario_id,empresa_id,pendencia_id,tipo,assunto,corpo,dedup) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (dedup) DO NOTHING`,
    [n.destinatarioId, n.empresaId ?? null, n.pendenciaId ?? null, n.tipo, n.assunto, n.corpo, n.dedup ?? null]);
}
export const textoAviso = (nome: string, frase: string, caminho: string) =>
  `Olá, ${nome.split(' ')[0]}.\n\n${frase}\n\nPara ver os detalhes, acesse o Painel do Cliente (é preciso entrar com seu login):\n${linkPainel(caminho)}\n\nEsta é uma mensagem automática. Por segurança, não enviamos documentos nem informações financeiras por e-mail.`;

/** Provedor por variável de ambiente: EMAIL_PROVIDER=smtp (SMTP_URL, EMAIL_FROM). Sem configuração: null (a fila só acumula). */
export function provedorPadrao(): EmailProvider | null {
  if ((process.env.EMAIL_PROVIDER ?? '').toLowerCase() !== 'smtp' || !process.env.SMTP_URL || !process.env.EMAIL_FROM) return null;
  const transporte = nodemailer.createTransport(process.env.SMTP_URL);
  return { nome: 'smtp', async enviar(m) { await transporte.sendMail({ from: process.env.EMAIL_FROM, to: m.para, subject: m.assunto, text: m.texto }); } };
}

/** Envia o que está pendente (ou falhou e ainda tem tentativas). Reivindica as linhas antes de enviar, então duas execuções simultâneas não mandam duas vezes. */
export async function processarFila(provedor: EmailProvider | null = provedorPadrao(), limite = 50) {
  if (!provedor) return { ativo: false as const, enviadas: 0, falhas: 0, canceladas: 0 };
  const lote = (await getPool().query(
    `WITH alvo AS (SELECT id FROM notificacoes WHERE status IN ('pendente','falha') AND tentativas < $1 ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
     UPDATE notificacoes n SET tentativas = n.tentativas + 1 FROM alvo WHERE n.id = alvo.id RETURNING n.id, n.destinatario_id, n.assunto, n.corpo`, [MAX_TENTATIVAS, limite])).rows;
  let enviadas = 0, falhas = 0, canceladas = 0;
  for (const n of lote) {
    const u = (await query('SELECT email,ativo,receber_emails FROM usuarios WHERE id=$1', [n.destinatario_id])).rows[0];
    if (!u || !u.ativo || !u.receber_emails) { await query(`UPDATE notificacoes SET status='cancelada' WHERE id=$1`, [n.id]); canceladas++; continue; }
    try { await provedor.enviar({ para: u.email, assunto: n.assunto, texto: n.corpo }); await query(`UPDATE notificacoes SET status='enviada', enviada_em=now(), erro=NULL WHERE id=$1`, [n.id]); enviadas++; }
    catch (e) { await query(`UPDATE notificacoes SET status='falha', erro=$2 WHERE id=$1`, [n.id, String((e as Error)?.message ?? e).replace(/\/\/[^@\s]*@/g, '//***@').slice(0, 300)]); falhas++; }
  }
  return { ativo: true as const, enviadas, falhas, canceladas };
}

/** Lembretes: prazo em até 2 dias e prazo vencido, só para pendências que aguardam o cliente. Uma vez por pessoa e prazo (dedup). */
export async function gerarLembretes() {
  return tx(async (c) => {
    const { rows } = await c.query(
      `SELECT p.id, p.empresa_id, p.prazo::text prazo, (p.prazo < hoje.d) vencida, u.id usuario_id, u.nome
         FROM pendencias p CROSS JOIN (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d) hoje
         JOIN empresas e ON e.id=p.empresa_id AND e.situacao='ativa'
         JOIN usuario_empresas ue ON ue.empresa_id=p.empresa_id JOIN usuarios u ON u.id=ue.usuario_id AND u.ativo AND u.papel='cliente' AND u.receber_emails
        WHERE p.situacao='aberta' AND p.prazo IS NOT NULL AND p.prazo <= hoje.d + 2`);
    for (const r of rows) {
      const dm = r.prazo.split('-').reverse().join('/');
      await enfileirar(c, r.vencida
        ? { destinatarioId: r.usuario_id, empresaId: r.empresa_id, pendenciaId: r.id, tipo: 'pendencia_vencida', dedup: `vencida:${r.id}:${r.prazo}:${r.usuario_id}`, assunto: 'Solicitação do escritório com prazo vencido', corpo: textoAviso(r.nome, `Uma solicitação do escritório está com o prazo vencido (${dm}).`, `/cliente/${r.empresa_id}/pendencias`) }
        : { destinatarioId: r.usuario_id, empresaId: r.empresa_id, pendenciaId: r.id, tipo: 'prazo_proximo', dedup: `prazo:${r.id}:${r.prazo}:${r.usuario_id}`, assunto: 'Solicitação do escritório perto do prazo', corpo: textoAviso(r.nome, `Uma solicitação do escritório vence em ${dm}.`, `/cliente/${r.empresa_id}/pendencias`) });
    }
    return rows.length;
  });
}
