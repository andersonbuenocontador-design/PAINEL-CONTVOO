'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { classificarEmLote, concluirConciliacao, confirmarLinhas, definirContaPlanoAtiva, devolverParaCorrecao, editarLinha, enviarParaConferencia, importarPlano, limparCorrecao, pedirCorrecao, reabrirConciliacao, reclassificarNaoRevisadas, salvarContaPlano, marcarSemNota } from '@/lib/services/conciliacao';

type R = { ok: true } | { ok: false; erro: string };
const rodar = async (fn: () => Promise<unknown>): Promise<R> => { try { await fn(); return { ok: true }; } catch (e) { return { ok: false, erro: mensagemDeErro(e) }; } };

/* chamadas da tabela interativa (retornam resultado; a tela atualiza sem recarregar tudo) */
export async function acaoClassificarLote(ids: number[], contaCodigo: number): Promise<R> { const u = await exigirUsuario(); return rodar(() => classificarEmLote(u, ids, contaCodigo)); }
export async function acaoConfirmarLinhas(ids: number[]): Promise<R> { const u = await exigirUsuario(); return rodar(() => confirmarLinhas(u, ids)); }
export async function acaoEditarLinha(id: number, d: { contaCodigo?: number | null; complemento?: string; observacao?: string; notaFiscal?: string; semNota?: boolean }): Promise<R> { const u = await exigirUsuario(); return rodar(() => editarLinha(u, id, d)); }
export async function acaoSemNota(ids: number[]): Promise<R> { const u = await exigirUsuario(); return rodar(() => marcarSemNota(u, ids)); }

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const baseDe = (papel: string, e: string) => (papel === 'admin' ? `/admin/empresas/${e}/extratos` : `/cliente/${e}/extratos`);
export async function acaoPedirCorrecao(ids: number[], motivo: string): Promise<R> { const u = await exigirUsuario('admin'); return rodar(() => pedirCorrecao(u, ids, motivo)); }
export async function acaoLimparCorrecao(ids: number[]): Promise<R> { const u = await exigirUsuario('admin'); return rodar(() => limparCorrecao(u, ids)); }

const voltarPara = (papel: string, e: string, c: string) => `${baseDe(papel, e)}?competencia=${c}`;
export async function acaoEnviarConferencia(fd: FormData) {
  const u = await exigirUsuario(); const e = s(fd, 'empresaId'), c = s(fd, 'competencia');
  await executar(voltarPara(u.papel, e, c), 'Competência enviada ao escritório para conferência.', () => enviarParaConferencia(u, e, c));
}
export async function acaoConcluirConciliacao(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'), c = s(fd, 'competencia');
  await executar(voltarPara(u.papel, e, c), 'Competência concluída.', () => concluirConciliacao(u, e, c));
}
export async function acaoDevolverConciliacao(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'), c = s(fd, 'competencia');
  await executar(voltarPara(u.papel, e, c), 'Competência devolvida ao cliente para correção.', () => devolverParaCorrecao(u, e, c, s(fd, 'mensagem')));
}
export async function acaoReabrirConciliacao(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'), c = s(fd, 'competencia');
  await executar(voltarPara(u.papel, e, c), 'Competência reaberta para o cliente.', () => reabrirConciliacao(u, e, c));
}

/* plano de contas (somente escritório) */
export async function acaoSalvarContaPlano(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/plano`, 'Conta salva.', () => salvarContaPlano(u, e, { codigo: Number(s(fd, 'codigo')), classificacao: s(fd, 'classificacao'), nome: s(fd, 'nome') }));
}
export async function acaoAtivarContaPlano(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/plano`, 'Conta atualizada.', () => definirContaPlanoAtiva(u, s(fd, 'id'), s(fd, 'ativo') === 'true'));
}
export async function acaoImportarPlano(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); let destino: string;
  try { const r = await importarPlano(u, e, s(fd, 'texto')); destino = `/admin/empresas/${e}/plano?ok=${encodeURIComponent(`${r.lidas} conta(s) lida(s): ${r.novas} nova(s), ${r.atualizadas} atualizada(s).`)}`; }
  catch (x) { destino = `/admin/empresas/${e}/plano?erro=${encodeURIComponent(mensagemDeErro(x))}`; }
  redirect(destino);
}
export async function acaoReclassificar(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); let destino: string;
  try { const n = await reclassificarNaoRevisadas(u, e); destino = `/admin/empresas/${e}/plano?ok=${encodeURIComponent(`${n} lançamento(s) não revisado(s) reclassificado(s) com o plano atual.`)}`; }
  catch (x) { destino = `/admin/empresas/${e}/plano?erro=${encodeURIComponent(mensagemDeErro(x))}`; }
  redirect(destino);
}
