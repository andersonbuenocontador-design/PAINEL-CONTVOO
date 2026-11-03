'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { cobrarDocumentos } from '@/lib/services/cobranca';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { aplicarModelo, conferirArquivo, criarExigencia, criarModeloDeEmpresa, definirExigenciaAtiva, editarExigencia, enviarArquivo, removerAvulso } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const item = (fd: FormData) => ({
  nome: s(fd, 'nome'), instituicao: s(fd, 'instituicao'), categoria: s(fd, 'categoria'), formatos: fd.getAll('formatos').map(String) as never[],
  obrigatorio: s(fd, 'obrigatorio') === 'on', frequencia: (s(fd, 'frequencia') || 'mensal') as never, instrucoes: s(fd, 'instrucoes'), diaPrazo: s(fd, 'diaPrazo') ? Number(s(fd, 'diaPrazo')) : null,
});
export async function acaoCriarExigencia(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/documentos`, 'Documento configurado.', () => criarExigencia(a, e, item(fd)));
}
export async function acaoEditarExigencia(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/documentos`, 'Documento atualizado.', () => editarExigencia(a, s(fd, 'id'), item(fd)));
}
export async function acaoAtivarExigencia(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/documentos`, 'Situação atualizada.', () => definirExigenciaAtiva(a, s(fd, 'id'), s(fd, 'ativo') === 'true'));
}
export async function acaoCriarModelo(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(`/admin/empresas/${e}/documentos`, 'Modelo criado.', () => criarModeloDeEmpresa(a, s(fd, 'nome'), e));
}
export async function acaoAplicarModelo(fd: FormData) {
  const a = await exigirUsuario('admin'); const voltar = s(fd, 'voltar') || '/admin';
  await executar(voltar, 'Modelo aplicado. Documentos que a empresa já tinha foram mantidos, sem sobrescrever.', () => aplicarModelo(a, s(fd, 'modeloId'), fd.getAll('empresaIds').map(String).filter(Boolean)));
}
export async function acaoConferir(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia');
  const d = s(fd, 'decisao') as 'em_conferencia' | 'aprovado' | 'rejeitado';
  await executar(`/admin/empresas/${e}/documentos?competencia=${c}`, 'Conferência registrada.', () => conferirArquivo(a, s(fd, 'arquivoId'), d, s(fd, 'motivo')));
}
export async function acaoEnviarPeloEscritorio(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia');
  await executar(`/admin/empresas/${e}/documentos?competencia=${c}`, 'Arquivo registrado.', async () => {
    const f = fd.get('arquivo'); if (!(f instanceof File) || !f.size) throw new AppError('Selecione um arquivo.');
    await enviarArquivo(a, { empresaId: e, exigenciaId: s(fd, 'exigenciaId'), competencia: c, nome: f.name, dados: Buffer.from(await f.arrayBuffer()) });
  });
}
export async function acaoRemoverAvulsoAdmin(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia');
  await executar(`/admin/empresas/${e}/documentos?competencia=${c}#outros`, 'Arquivo retirado.', () => removerAvulso(a, s(fd, 'id')));
}
export async function acaoCobrarDocumentos(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia'); const volta = `/admin/entregas?competencia=${c}`;
  let destino: string;
  try { const r = await cobrarDocumentos(a, e, c); destino = `${volta}&ok=${encodeURIComponent(r.lembrete ? 'Lembrete enviado ao painel do cliente.' : 'Cobrança enviada ao painel do cliente.')}`; }
  catch (x) { destino = `${volta}&erro=${encodeURIComponent(mensagemDeErro(x))}`; }
  redirect(destino);
}
