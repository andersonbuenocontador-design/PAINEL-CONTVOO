'use server';
import { exigirUsuario } from '@/lib/session';
import { executar } from '@/lib/actions-util';
import { desfazerNaoRetirada, marcarNaoRetirada } from '@/lib/services/lucros';
import { reabrirRetiradas } from '@/lib/services/retiradas';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const volta = (fd: FormData) => `/admin/lucros/${s(fd, 'empresaId')}?competencia=${s(fd, 'competencia')}`;
export async function acaoNaoERetirada(fd: FormData) {
  const u = await exigirUsuario('admin');
  await executar(volta(fd), 'Marcado como "não é retirada". Não aparece mais como possível esquecimento.', () => marcarNaoRetirada(u, Number(s(fd, 'movId')), s(fd, 'motivo')));
}
export async function acaoDesfazerNaoERetirada(fd: FormData) {
  const u = await exigirUsuario('admin');
  await executar(volta(fd), 'Lançamento voltou para a comparação.', () => desfazerNaoRetirada(u, Number(s(fd, 'movId'))));
}
export async function acaoDevolverLucros(fd: FormData) {
  const u = await exigirUsuario('admin');
  await executar(volta(fd), 'Mês devolvido ao cliente para ele completar as retiradas.', () => reabrirRetiradas(u, s(fd, 'empresaId'), s(fd, 'competencia')));
}
