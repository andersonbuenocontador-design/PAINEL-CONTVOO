'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { autenticar, trocarSenha } from '@/lib/services/usuarios';
import { criarMfaPendente, criarSessao, encerrarSessao, lerMfaPendente, limparMfaPendente, usuarioAtual } from '@/lib/session';
import { verificarSegundoFator } from '@/lib/services/seguranca';
import { mensagemDeErro } from '@/lib/actions-util';

/** IP do cliente, só quando há UM proxy reverso confiável (TRUST_PROXY=1) que sobrescreve X-Forwarded-For. Sem isso não limitamos por IP (evita bloquear todo mundo por um IP único). */
async function ipDaRequisicao() {
  if (process.env.TRUST_PROXY !== '1') return undefined;
  const h = await headers(); const xff = h.get('x-forwarded-for'); return (xff ? xff.split(',').pop()!.trim() : h.get('x-real-ip')) || undefined;
}
const destinoPos = (u: { deve_trocar_senha: boolean; papel: string }) => (u.deve_trocar_senha ? '/trocar-senha' : u.papel === 'admin' ? '/admin' : '/cliente');
export async function entrar(fd: FormData) {
  let destino = '/';
  try {
    const u = await autenticar(String(fd.get('email') ?? ''), String(fd.get('senha') ?? ''), await ipDaRequisicao());
    if (u.mfa_ativo) { await criarMfaPendente(u.id); destino = '/login/verificar'; }
    else { await criarSessao(u); destino = destinoPos(u); }
  } catch (e) { destino = `/login?erro=${encodeURIComponent(mensagemDeErro(e))}`; }
  redirect(destino);
}
export async function verificarMfaAcao(fd: FormData) {
  const id = await lerMfaPendente(); if (!id) redirect('/login?erro=' + encodeURIComponent('Sua verificação expirou. Entre de novo.'));
  let destino = '/';
  try { const u = await verificarSegundoFator(id, String(fd.get('codigo') ?? '')); await limparMfaPendente(); await criarSessao(u); destino = destinoPos(u); }
  catch (e) { destino = `/login/verificar?erro=${encodeURIComponent(mensagemDeErro(e))}`; }
  redirect(destino);
}
export async function sair() { await encerrarSessao(); redirect('/login'); }

export async function alterarSenha(fd: FormData) {
  const u = await usuarioAtual();
  if (!u) redirect('/login');
  let destino = '/';
  try {
    const nova = String(fd.get('nova') ?? '');
    if (nova !== String(fd.get('confirma') ?? '')) throw new Error('x');
    const tv = await trocarSenha(u.id, String(fd.get('atual') ?? ''), nova);
    await criarSessao({ id: u.id, token_version: tv });
    destino = u.papel === 'admin' ? '/admin' : '/cliente';
  } catch (e) {
    destino = `/trocar-senha?erro=${encodeURIComponent(e instanceof Error && e.message === 'x' ? 'A confirmação não confere com a nova senha.' : mensagemDeErro(e))}`;
  }
  redirect(destino);
}
