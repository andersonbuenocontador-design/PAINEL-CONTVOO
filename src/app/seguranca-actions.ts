'use server';
import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/session';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { ativarMfa, iniciarMfa, redefinirMfa } from '@/lib/services/seguranca';
import { exigirUsuario } from '@/lib/session';

export async function acaoIniciarMfa() {
  const u = await usuarioAtual(); if (!u) redirect('/login');
  await executar('/conta/seguranca', 'Escaneie o QR code no aplicativo e digite o código.', () => iniciarMfa(u));
}
export async function acaoAtivarMfa(_: unknown, fd: FormData): Promise<{ codigos?: string[]; erro?: string }> {
  const u = await usuarioAtual(); if (!u) redirect('/login');
  try { return { codigos: await ativarMfa(u, String(fd.get('codigo') ?? '')) }; } catch (e) { return { erro: mensagemDeErro(e) }; }
}
export async function acaoRedefinirMfa(fd: FormData) {
  const u = await exigirUsuario('admin');
  await executar('/admin/usuarios', 'Verificação em duas etapas redefinida. A pessoa configura de novo no próximo acesso.', () => redefinirMfa(u, String(fd.get('id') ?? '')));
}
