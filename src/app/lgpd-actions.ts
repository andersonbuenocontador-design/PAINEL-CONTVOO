'use server';
import { exigirUsuario } from '@/lib/session';
import { executar } from '@/lib/actions-util';
import { anonimizarUsuario, descartarVencidos } from '@/lib/services/lgpd';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
export async function acaoDescartar(fd: FormData) {
  const u = await exigirUsuario('admin');
  await executar('/admin/lgpd', 'Descarte concluído. O conteúdo dos arquivos vencidos foi apagado (metadados e auditoria permanecem).', () => descartarVencidos(u, s(fd, 'confirmacao')));
}
export async function acaoAnonimizar(fd: FormData) { const u = await exigirUsuario('admin'); await executar('/admin/lgpd', 'Usuário anonimizado.', () => anonimizarUsuario(u, s(fd, 'usuarioId'), s(fd, 'confirmacao'))); }
