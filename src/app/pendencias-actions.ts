'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { cancelarPendencia, criarPendencia, reabrirPendencia, resolverPendencia, responder } from '@/lib/services/pendencias';
import { gerarLembretes, processarFila } from '@/lib/notificacoes';
import { definirReceberEmails } from '@/lib/services/usuarios';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const baseDe = (papel: string, e: string) => (papel === 'admin' ? `/admin/empresas/${e}/pendencias` : `/cliente/${e}/pendencias`);

export async function acaoCriarPendencia(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(baseDe('admin', e), 'Solicitação enviada ao cliente.', () => criarPendencia(u, e, { categoria: s(fd, 'categoria') as never, descricao: s(fd, 'descricao'), competencia: s(fd, 'competencia'), prazo: s(fd, 'prazo'), responsavelId: s(fd, 'responsavelId') || null }));
}
export async function acaoResponderPendencia(fd: FormData) { const u = await exigirUsuario(); const e = s(fd, 'empresaId'); await executar(baseDe(u.papel, e), 'Resposta enviada.', () => responder(u, s(fd, 'id'), s(fd, 'texto'))); }
export async function acaoResolverPendencia(fd: FormData) { const u = await exigirUsuario('admin'); await executar(baseDe('admin', s(fd, 'empresaId')), 'Pendência resolvida.', () => resolverPendencia(u, s(fd, 'id'))); }
export async function acaoReabrirPendencia(fd: FormData) { const u = await exigirUsuario('admin'); await executar(baseDe('admin', s(fd, 'empresaId')), 'Pendência reaberta.', () => reabrirPendencia(u, s(fd, 'id'))); }
export async function acaoCancelarPendencia(fd: FormData) { const u = await exigirUsuario('admin'); await executar(baseDe('admin', s(fd, 'empresaId')), 'Pendência cancelada.', () => cancelarPendencia(u, s(fd, 'id'))); }
export async function acaoProcessarNotificacoes() {
  await exigirUsuario('admin'); let destino: string;
  try {
    const lembretes = await gerarLembretes(); const r = await processarFila();
    destino = r.ativo ? `/admin/notificacoes?ok=${encodeURIComponent(`${r.enviadas} enviado(s), ${r.falhas} com falha, ${r.canceladas} cancelado(s). ${lembretes} lembrete(s) avaliado(s).`)}` : `/admin/notificacoes?erro=${encodeURIComponent('O envio de e-mails não está configurado (EMAIL_PROVIDER, BREVO_API_KEY e EMAIL_FROM). Os avisos continuam na fila.')}`;
  } catch (e) { destino = `/admin/notificacoes?erro=${encodeURIComponent(mensagemDeErro(e))}`; }
  redirect(destino);
}
export async function acaoPreferenciaEmail(fd: FormData) { const u = await exigirUsuario('admin'); await executar('/admin/usuarios', 'Preferência de e-mail atualizada.', () => definirReceberEmails(u, s(fd, 'id'), s(fd, 'valor') === 'true')); }
