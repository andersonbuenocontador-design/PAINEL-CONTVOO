'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { executar, mensagemDeErro, recarregar } from '@/lib/actions-util';
import { enviarPorGclick, enviarPorWhatsapp, salvarConfigSolicitacao, type Resultado } from '@/lib/services/gclick-solicitacao';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const V = '/admin/gclick/solicitacao';
const comp = (fd: FormData) => (/^\d{4}-\d{2}$/.test(s(fd, 'competencia')) ? s(fd, 'competencia') : '');

export async function acaoSalvarConfigSolicitacao(fd: FormData) {
  const u = await exigirUsuario('admin');
  await executar(`${V}?competencia=${comp(fd)}#config`, 'Configuração salva.', () => salvarConfigSolicitacao(u, { sistema: s(fd, 'sistema'), usuario: s(fd, 'usuario'), tarefa: s(fd, 'tarefa'), mensagem: s(fd, 'mensagem') }));
}
const texto = (r: Resultado, oque: string) => `${r.enviados} ${oque}${r.pulados ? `, ${r.pulados} já estavam enviados` : ''}${r.erros ? `, ${r.erros} com erro (${r.primeiroErro})` : ''}.`;
async function lote(fd: FormData, fn: typeof enviarPorGclick, oque: string) {
  const u = await exigirUsuario('admin'); const c = comp(fd); let destino: string;
  try { const r = await fn(u, { competencia: c, teste: s(fd, 'teste') === '1' }); destino = `${V}?competencia=${c}&buscar=1&${r.erros && !r.enviados ? 'erro' : 'ok'}=${encodeURIComponent(texto(r, oque))}`; }
  catch (e) { destino = `${V}?competencia=${c}&buscar=1&erro=${encodeURIComponent(mensagemDeErro(e))}`; }
  recarregar(V); redirect(destino);
}
export async function acaoEnviarGclick(fd: FormData) { await lote(fd, enviarPorGclick, 'tarefa(s) com ✔ no G-Click (o G-Click manda o e-mail)'); }
export async function acaoEnviarWhatsapp(fd: FormData) { await lote(fd, enviarPorWhatsapp, 'mensagem(ns) enviada(s) pelo WhatsApp'); }
