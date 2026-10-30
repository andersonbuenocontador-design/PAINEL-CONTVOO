'use server';
import { exigirUsuario } from '@/lib/session';
import { executar } from '@/lib/actions-util';
import { AppError } from '@/lib/errors';
import { enviarArquivo, enviarAvulsos, removerAvulso } from '@/lib/services/documentos';

export async function acaoEnviarArquivo(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  await executar(`/cliente/${empresaId}?competencia=${competencia}`, 'Arquivo enviado.', async () => {
    const f = fd.get('arquivo');
    if (!(f instanceof File) || !f.size) throw new AppError('Selecione um arquivo.');
    await enviarArquivo(u, { empresaId, exigenciaId: String(fd.get('exigenciaId') ?? ''), competencia, nome: f.name, dados: Buffer.from(await f.arrayBuffer()) });
  });
}

export async function acaoEnviarAvulsos(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  const arquivos = fd.getAll('arquivos').filter((f): f is File => f instanceof File && f.size > 0);
  await executar(`/cliente/${empresaId}?competencia=${competencia}#outros`, arquivos.length > 1 ? `${arquivos.length} PDFs enviados.` : 'PDF enviado.', async () => {
    if (!arquivos.length) throw new AppError('Selecione ao menos um PDF.');
    await enviarAvulsos(u, { empresaId, competencia, descricao: String(fd.get('descricao') ?? ''), arquivos: await Promise.all(arquivos.map(async (f) => ({ nome: f.name, dados: Buffer.from(await f.arrayBuffer()) }))) });
  });
}
export async function acaoRemoverAvulso(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  await executar(`/cliente/${empresaId}?competencia=${competencia}#outros`, 'Arquivo retirado.', () => removerAvulso(u, String(fd.get('id') ?? '')));
}
