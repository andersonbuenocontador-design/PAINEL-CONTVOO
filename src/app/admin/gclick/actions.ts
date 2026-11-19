'use server';
import { exigirUsuario } from '@/lib/session';
import { redirect } from 'next/navigation';
import { executar, mensagemDeErro, recarregar } from '@/lib/actions-util';
import { desligarGclick, idsSchema, importarGclick, salvarAcessoGclick } from '@/lib/services/gclick';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const V = '/admin/gclick';
export async function acaoSalvarGclick(fd: FormData) { const u = await exigirUsuario('admin'); await executar(V, 'Acesso ao G-Click salvo. Agora clique em "Buscar clientes no G-Click".', () => salvarAcessoGclick(u, { clientId: s(fd, 'clientId'), segredo: s(fd, 'segredo') })); }
export async function acaoDesligarGclick() { const u = await exigirUsuario('admin'); await executar(V, 'G-Click desligado e chave apagada.', () => desligarGclick(u)); }
export async function acaoImportarGclick(fd: FormData) {
  const u = await exigirUsuario('admin'); let destino: string;
  try {
    const r = await importarGclick(u, idsSchema.parse(fd.getAll('gclickId')));
    destino = `${V}?ok=${encodeURIComponent(`${r.ligadas} empresa(s) ligada(s) ao G-Click, ${r.criadas} nova(s) cadastrada(s), ${r.whatsapps} WhatsApp(s) preenchido(s).`)}`;
  } catch (e) { destino = `${V}?erro=${encodeURIComponent(mensagemDeErro(e))}`; }
  recarregar(V); recarregar('/admin/entregas'); redirect(destino);
}
