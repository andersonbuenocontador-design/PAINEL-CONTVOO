'use server';
import { exigirUsuario } from '@/lib/session';
import { executar } from '@/lib/actions-util';
import { AppError } from '@/lib/errors';
import { enviarArquivo } from '@/lib/services/documentos';

export async function acaoEnviarArquivo(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  await executar(`/cliente/${empresaId}?competencia=${competencia}`, 'Arquivo enviado.', async () => {
    const f = fd.get('arquivo');
    if (!(f instanceof File) || !f.size) throw new AppError('Selecione um arquivo.');
    await enviarArquivo(u, { empresaId, exigenciaId: String(fd.get('exigenciaId') ?? ''), competencia, nome: f.name, dados: Buffer.from(await f.arrayBuffer()) });
  });
}
