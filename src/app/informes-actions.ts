'use server';
import { exigirUsuario } from '@/lib/session';
import { executar } from '@/lib/actions-util';
import { AppError } from '@/lib/errors';
import { criarInforme, criarSocio, criarTipo, definirAcessoSocio, definirSituacaoInforme, definirSocioAtivo, definirTipoAtivo, editarSocio, substituirArquivoInforme } from '@/lib/services/informes';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const voltar = (e: string) => `/admin/empresas/${e}/informes`;
const socioDados = (fd: FormData) => ({ nome: s(fd, 'nome'), cpf: s(fd, 'cpf'), email: s(fd, 'email'), restrito: s(fd, 'restrito') === 'on' });
async function arquivo(fd: FormData) { const f = fd.get('arquivo'); if (!(f instanceof File) || !f.size) throw new AppError('Selecione o arquivo.'); return { nome: f.name, dados: Buffer.from(await f.arrayBuffer()) }; }

export async function acaoCriarSocio(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Sócio cadastrado. Autorize abaixo quais usuários podem ver os informes dele.', () => criarSocio(u, e, socioDados(fd))); }
export async function acaoEditarSocio(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Sócio atualizado.', () => editarSocio(u, s(fd, 'id'), socioDados(fd))); }
export async function acaoAtivarSocio(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Sócio atualizado.', () => definirSocioAtivo(u, s(fd, 'id'), s(fd, 'ativo') === 'true')); }
export async function acaoAcessoSocio(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Acesso atualizado.', () => definirAcessoSocio(u, s(fd, 'socioId'), s(fd, 'usuarioId'), s(fd, 'modo') === 'permitir')); }
export async function acaoCriarInforme(fd: FormData) {
  const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId');
  await executar(voltar(e), s(fd, 'disponibilizar') === 'on' ? 'Informe cadastrado e disponibilizado.' : 'Informe cadastrado como rascunho (o cliente ainda não vê).', async () => {
    const f = await arquivo(fd);
    await criarInforme(u, e, { socioId: s(fd, 'socioId'), tipoId: s(fd, 'tipoId'), ano: Number(s(fd, 'ano')), periodo: s(fd, 'periodo'), descricao: s(fd, 'descricao'), disponibilizar: s(fd, 'disponibilizar') === 'on', nome: f.nome, dados: f.dados });
  });
}
export async function acaoNovaVersao(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Nova versão enviada. A anterior foi guardada no histórico.', async () => { const f = await arquivo(fd); await substituirArquivoInforme(u, s(fd, 'id'), f.nome, f.dados); }); }
export async function acaoSituacaoInforme(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Situação atualizada.', () => definirSituacaoInforme(u, s(fd, 'id'), s(fd, 'situacao') === 'retirado' ? 'retirado' : 'disponivel')); }
export async function acaoCriarTipo(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Tipo criado.', () => criarTipo(u, s(fd, 'nome'))); }
export async function acaoAtivarTipo(fd: FormData) { const u = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); await executar(voltar(e), 'Tipo atualizado.', () => definirTipoAtivo(u, s(fd, 'id'), s(fd, 'ativo') === 'true')); }
