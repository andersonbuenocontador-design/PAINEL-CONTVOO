'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { AppError } from '@/lib/errors';
import { enviarArquivo, enviarAvulsos, exigenciaEhExtrato, removerAvulso } from '@/lib/services/documentos';
import { importarDireto, resumoImportacao } from '@/lib/services/extratos';

export async function acaoEnviarArquivo(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? ''), exigenciaId = String(fd.get('exigenciaId') ?? '');
  const f = fd.get('arquivo');
  const voltar = `/cliente/${empresaId}/documentos?competencia=${competencia}`;
  if (!(f instanceof File) || !f.size || !(await exigenciaEhExtrato(u, empresaId, exigenciaId).catch(() => false))) {
    return executar(voltar, 'Arquivo enviado.', async () => {
      if (!(f instanceof File) || !f.size) throw new AppError('Selecione um arquivo.');
      await enviarArquivo(u, { empresaId, exigenciaId, competencia, nome: f.name, dados: Buffer.from(await f.arrayBuffer()) });
    });
  }
  // Extrato bancário: os lançamentos vão direto para a conciliação e o arquivo fica registrado como documento entregue
  const dados = Buffer.from(await f.arrayBuffer());
  let imp: Awaited<ReturnType<typeof importarDireto>> | null = null, erroLeitura = '', erroArquivo = '';
  try { imp = await importarDireto(u, { empresaId, competencia, nome: f.name, dados }); } catch (e) { erroLeitura = mensagemDeErro(e); }
  try { await enviarArquivo(u, { empresaId, exigenciaId, competencia, nome: f.name, dados }); } catch (e) { erroArquivo = mensagemDeErro(e); }
  if (imp) {
    const msg = resumoImportacao(imp, competencia) + (erroArquivo ? ` Porém o arquivo não ficou registrado em Documentos do mês: ${erroArquivo}` : ' O extrato também ficou registrado em Documentos do mês.');
    redirect(`/cliente/${empresaId}/extratos?competencia=${imp.competencia}&${erroArquivo ? 'erro' : 'ok'}=${encodeURIComponent(msg)}`);
  }
  if (!erroArquivo) redirect(`${voltar}&ok=${encodeURIComponent(`Extrato recebido. Não consegui levar os lançamentos para a conciliação automaticamente (${erroLeitura}) — o escritório vai tratar.`)}`);
  redirect(`${voltar}&erro=${encodeURIComponent(erroArquivo)}`);
}
export async function acaoEnviarAvulsos(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  const arquivos = fd.getAll('arquivos').filter((f): f is File => f instanceof File && f.size > 0);
  await executar(`/cliente/${empresaId}/documentos?competencia=${competencia}#outros`, arquivos.length > 1 ? `${arquivos.length} PDFs enviados.` : 'PDF enviado.', async () => {
    if (!arquivos.length) throw new AppError('Selecione ao menos um PDF.');
    await enviarAvulsos(u, { empresaId, competencia, descricao: String(fd.get('descricao') ?? ''), arquivos: await Promise.all(arquivos.map(async (f) => ({ nome: f.name, dados: Buffer.from(await f.arrayBuffer()) }))) });
  });
}
export async function acaoRemoverAvulso(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  await executar(`/cliente/${empresaId}/documentos?competencia=${competencia}#outros`, 'Arquivo retirado.', () => removerAvulso(u, String(fd.get('id') ?? '')));
}
