'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { AppError } from '@/lib/errors';
import { cancelarImportacao, confirmarImportacao, criarConta, criarPrevia, definirContaAtiva } from '@/lib/services/extratos';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const baseDe = (papel: string, empresaId: string) => (papel === 'admin' ? `/admin/empresas/${empresaId}/extratos` : `/cliente/${empresaId}/extratos`);

export async function acaoEnviarExtrato(fd: FormData) {
  const u = await exigirUsuario(); const empresaId = s(fd, 'empresaId'), competencia = s(fd, 'competencia'); const base = baseDe(u.papel, empresaId);
  let destino: string;
  try {
    const f = fd.get('arquivo');
    if (!(f instanceof File) || !f.size) throw new AppError('Selecione o arquivo do extrato.');
    const id = await criarPrevia(u, { empresaId, contaId: s(fd, 'contaId'), competencia, nome: f.name, dados: Buffer.from(await f.arrayBuffer()) });
    destino = `${base}/importacao/${id}`;
  } catch (e) { destino = `${base}?competencia=${competencia}&erro=${encodeURIComponent(mensagemDeErro(e))}`; }
  redirect(destino);
}
export async function acaoConfirmarImportacao(fd: FormData) {
  const u = await exigirUsuario(); const empresaId = s(fd, 'empresaId'), competencia = s(fd, 'competencia'); const base = baseDe(u.papel, empresaId);
  let destino: string;
  try {
    const r = await confirmarImportacao(u, s(fd, 'id'), fd.getAll('incluir').map(Number).filter(Number.isInteger));
    destino = `${base}?competencia=${competencia}&ok=${encodeURIComponent(`${r.gravadas} movimentação(ões) importada(s); ${r.ignoradas} ignorada(s).`)}`;
  } catch (e) { destino = `${base}/importacao/${s(fd, 'id')}?erro=${encodeURIComponent(mensagemDeErro(e))}`; }
  redirect(destino);
}
export async function acaoCancelarImportacao(fd: FormData) {
  const u = await exigirUsuario(); const empresaId = s(fd, 'empresaId'), competencia = s(fd, 'competencia');
  await executar(`${baseDe(u.papel, empresaId)}?competencia=${competencia}`, 'Importação cancelada. Nada foi gravado.', () => cancelarImportacao(u, s(fd, 'id')));
}
/* --- somente escritório --- */
export async function acaoCriarConta(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/extratos`, 'Conta cadastrada.', () => criarConta(u, e, { banco: s(fd, 'banco'), apelido: s(fd, 'apelido'), agencia: s(fd, 'agencia'), conta: s(fd, 'conta') }));
}
export async function acaoAtivarConta(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/extratos`, 'Conta atualizada.', () => definirContaAtiva(u, s(fd, 'id'), s(fd, 'ativo') === 'true'));
}
