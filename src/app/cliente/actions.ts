'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { AppError } from '@/lib/errors';
import { enviarArquivo, enviarAvulsos, exigenciaEhExtrato, removerAvulso } from '@/lib/services/documentos';
import { importarDireto, marcarExtratoVerificado, resumoImportacao, tentarImportarExtrato, urlConciliacao } from '@/lib/services/extratos';

export async function acaoEnviarArquivo(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? ''), exigenciaId = String(fd.get('exigenciaId') ?? '');
  const f = fd.get('arquivo');
  const voltar = `/cliente/${empresaId}/documentos?competencia=${competencia}`;
  if (!(f instanceof File) || !f.size) redirect(`${voltar}&erro=${encodeURIComponent('Selecione um arquivo.')}`);
  if (!(await exigenciaEhExtrato(u, empresaId, exigenciaId).catch(() => false))) {
    const dados = Buffer.from(await f.arrayBuffer());
    let arqId = '';
    try { arqId = await enviarArquivo(u, { empresaId, exigenciaId, competencia, nome: f.name, dados }); }
    catch (e) { redirect(`${voltar}&erro=${encodeURIComponent(mensagemDeErro(e))}`); }
    const imp = await tentarImportarExtrato(u, { empresaId, competencia, nome: f.name, dados }); // é extrato de banco? vai também para a conciliação
    await marcarExtratoVerificado('arquivos', arqId);
    if (imp) redirect(urlConciliacao(`/cliente/${empresaId}/extratos`, imp, { ok: `${resumoImportacao(imp, competencia)} O arquivo também ficou registrado em Documentos do mês.` }));
    redirect(`${voltar}&ok=${encodeURIComponent('Arquivo enviado.')}`);
  }
  // Extrato bancário: os lançamentos vão direto para a conciliação e o arquivo fica registrado como documento entregue
  const dados = Buffer.from(await f.arrayBuffer());
  let imp: Awaited<ReturnType<typeof importarDireto>> | null = null, erroLeitura = '', erroArquivo = '';
  try { imp = await importarDireto(u, { empresaId, competencia, nome: f.name, dados }); } catch (e) { erroLeitura = mensagemDeErro(e); }
  try { await marcarExtratoVerificado('arquivos', await enviarArquivo(u, { empresaId, exigenciaId, competencia, nome: f.name, dados })); } catch (e) { erroArquivo = mensagemDeErro(e); }
  if (imp) {
    const msg = resumoImportacao(imp, competencia) + (erroArquivo ? ` Porém o arquivo não ficou registrado em Documentos do mês: ${erroArquivo}` : ' O extrato também ficou registrado em Documentos do mês.');
    redirect(urlConciliacao(`/cliente/${empresaId}/extratos`, imp, erroArquivo ? { erro: msg } : { ok: msg }));
  }
  if (!erroArquivo) redirect(`${voltar}&ok=${encodeURIComponent(`Extrato recebido. Não consegui levar os lançamentos para a conciliação automaticamente (${erroLeitura}) — o escritório vai tratar.`)}`);
  redirect(`${voltar}&erro=${encodeURIComponent(erroArquivo)}`);
}
export async function acaoEnviarAvulsos(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  const voltar = `/cliente/${empresaId}/documentos?competencia=${competencia}`;
  const arquivos = fd.getAll('arquivos').filter((f): f is File => f instanceof File && f.size > 0);
  if (!arquivos.length) redirect(`${voltar}&erro=${encodeURIComponent('Selecione ao menos um PDF.')}#outros`);
  const lidos = await Promise.all(arquivos.map(async (f) => ({ nome: f.name, dados: Buffer.from(await f.arrayBuffer()) })));
  let ids: string[] = [];
  try { ids = await enviarAvulsos(u, { empresaId, competencia, descricao: String(fd.get('descricao') ?? ''), arquivos: lidos }); }
  catch (e) { redirect(`${voltar}&erro=${encodeURIComponent(mensagemDeErro(e))}#outros`); }
  // PDF que é extrato de banco: os lançamentos vão também para a conciliação, e o cliente é levado para lá
  const imps = [];
  for (const [k, a] of lidos.entries()) { const r = await tentarImportarExtrato(u, { empresaId, competencia, ...a }); if (ids[k]) await marcarExtratoVerificado('documentos_avulsos', ids[k]); if (r) imps.push(r); }
  if (imps.length) {
    const msg = imps.map((r) => resumoImportacao(r, competencia)).join(' ') + ' Os PDFs também ficaram em Outros documentos.';
    redirect(urlConciliacao(`/cliente/${empresaId}/extratos`, imps.length === 1 ? imps[0] : { competencia: imps[0].competencia }, { ok: msg }));
  }
  redirect(`${voltar}&ok=${encodeURIComponent(lidos.length > 1 ? `${lidos.length} PDFs enviados.` : 'PDF enviado.')}#outros`);
}
export async function acaoRemoverAvulso(fd: FormData) {
  const u = await exigirUsuario('cliente');
  const empresaId = String(fd.get('empresaId') ?? ''), competencia = String(fd.get('competencia') ?? '');
  await executar(`/cliente/${empresaId}/documentos?competencia=${competencia}#outros`, 'Arquivo retirado.', () => removerAvulso(u, String(fd.get('id') ?? '')));
}
