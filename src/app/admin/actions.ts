'use server';
import { exigirUsuario } from '@/lib/session';
import { redirect } from 'next/navigation';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { criarEmpresa, editarEmpresa, definirSituacao } from '@/lib/services/empresas';
import { criarUsuario, definirAtivo, redefinirSenha, vincular } from '@/lib/services/usuarios';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const dadosEmpresa = (fd: FormData) => ({
  razaoSocial: s(fd, 'razaoSocial'), nomeFantasia: s(fd, 'nomeFantasia'), cnpj: s(fd, 'cnpj'),
  emailContato: s(fd, 'emailContato'), responsavelId: s(fd, 'responsavelId') || null, inicioUso: s(fd, 'inicioUso'),
});

export async function acaoCriarEmpresa(fd: FormData) {
  const a = await exigirUsuario('admin');
  let destino: string;
  try { await criarEmpresa(a, dadosEmpresa(fd)); destino = `/admin/empresas?ok=${encodeURIComponent('Empresa cadastrada.')}`; }
  catch (e) { destino = `/admin/empresas/nova?erro=${encodeURIComponent(mensagemDeErro(e))}`; } // erro: volta ao formulário
  redirect(destino);
}
export async function acaoEditarEmpresa(fd: FormData) {
  const a = await exigirUsuario('admin'); const id = s(fd, 'id');
  await executar(`/admin/empresas/${id}`, 'Dados salvos.', () => editarEmpresa(a, id, dadosEmpresa(fd)));
}
export async function acaoSituacaoEmpresa(fd: FormData) {
  const a = await exigirUsuario('admin'); const id = s(fd, 'id');
  await executar(`/admin/empresas/${id}`, 'Situação atualizada.', () => definirSituacao(a, id, s(fd, 'situacao') === 'ativa' ? 'ativa' : 'inativa'));
}
export async function acaoCriarUsuario(fd: FormData) {
  const a = await exigirUsuario('admin'); const voltar = s(fd, 'voltar') || '/admin/usuarios';
  await executar(voltar, 'Usuário criado. Ele precisará trocar a senha no primeiro acesso.', () =>
    criarUsuario(a, { nome: s(fd, 'nome'), email: s(fd, 'email'), papel: s(fd, 'papel') === 'admin' ? 'admin' : 'cliente', senhaTemporaria: s(fd, 'senha'), empresaIds: fd.getAll('empresaIds').map(String).filter(Boolean) }));
}
export async function acaoAtivoUsuario(fd: FormData) {
  const a = await exigirUsuario('admin');
  await executar('/admin/usuarios', 'Acesso atualizado.', () => definirAtivo(a, s(fd, 'id'), s(fd, 'ativo') === 'true'));
}
export async function acaoSenhaUsuario(fd: FormData) {
  const a = await exigirUsuario('admin');
  await executar('/admin/usuarios', 'Senha temporária definida.', () => redefinirSenha(a, s(fd, 'id'), s(fd, 'senha')));
}
export async function acaoVincular(fd: FormData) {
  const a = await exigirUsuario('admin'); const voltar = s(fd, 'voltar') || '/admin/usuarios';
  await executar(voltar, 'Vínculo atualizado.', () => vincular(a, s(fd, 'usuarioId'), s(fd, 'empresaId'), s(fd, 'modo') === 'vincular'));
}
