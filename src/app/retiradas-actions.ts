'use server';
import { exigirUsuario } from '@/lib/session';
import { executar } from '@/lib/actions-util';
import { enviarRetiradas, lancarRetirada, reabrirRetiradas, removerRetirada } from '@/lib/services/retiradas';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const voltaCliente = (fd: FormData) => `/cliente/${s(fd, 'empresaId')}/informes?competencia=${s(fd, 'competencia')}`;

export async function acaoLancarRetirada(fd: FormData) {
  const u = await exigirUsuario('cliente');
  await executar(voltaCliente(fd), 'Retirada lançada.', () => lancarRetirada(u, s(fd, 'empresaId'), s(fd, 'competencia'),
    { data: s(fd, 'data'), socio: s(fd, 'socio'), tipo: s(fd, 'tipo') as 'pro_labore', valor: s(fd, 'valor'), observacao: s(fd, 'observacao') }));
}
export async function acaoRemoverRetirada(fd: FormData) {
  const u = await exigirUsuario('cliente');
  await executar(voltaCliente(fd), 'Lançamento excluído.', () => removerRetirada(u, s(fd, 'id')));
}
export async function acaoEnviarRetiradas(fd: FormData) {
  const u = await exigirUsuario('cliente'); const sem = s(fd, 'sem') === '1';
  await executar(voltaCliente(fd), sem ? 'Informado ao escritório: não houve retiradas neste mês.' : 'Retiradas enviadas ao escritório.', () => enviarRetiradas(u, s(fd, 'empresaId'), s(fd, 'competencia'), sem));
}
export async function acaoReabrirRetiradas(fd: FormData) {
  const u = await exigirUsuario('admin');
  await executar(`/admin/empresas/${s(fd, 'empresaId')}/informes?competencia=${s(fd, 'competencia')}`, 'Mês devolvido ao cliente para correção.', () => reabrirRetiradas(u, s(fd, 'empresaId'), s(fd, 'competencia')));
}
