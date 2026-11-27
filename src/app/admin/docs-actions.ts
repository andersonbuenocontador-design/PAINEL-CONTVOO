'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { aplicarModelo, conferirArquivo, criarExigencia, criarModeloDeEmpresa, definirExigenciaAtiva, editarExigencia, enviarArquivo, exigenciaEhExtrato, removerAvulso } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';
import { digisacPronto, enviarWhatsappDigisac } from '@/lib/services/digisac';
import { pendenciasDoMes } from '@/lib/services/integracao';
import { registrar } from '@/lib/services/auditoria';
import { query } from '@/lib/db';
import { lerExtratoDoDocumento, marcarExtratoVerificado, resumoImportacao, retirarLancamentosDoArquivo, urlConciliacao } from '@/lib/services/extratos';
import { recarregar } from '@/lib/actions-util';

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
  const retirar = s(fd, 'retirarLancamentos') === 'on';
  await executar(`/admin/empresas/${e}/documentos?competencia=${c}`, retirar ? 'Conferência registrada e lançamentos do arquivo retirados da conciliação.' : 'Conferência registrada.', async () => {
    await conferirArquivo(a, s(fd, 'arquivoId'), d, s(fd, 'motivo'));
    if (retirar) await retirarLancamentosDoArquivo(a, s(fd, 'arquivoId'));
  });
}
export async function acaoEnviarPeloEscritorio(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia'); const exigenciaId = s(fd, 'exigenciaId');
  const voltar = `/admin/empresas/${e}/documentos?competencia=${c}`; recarregar(voltar); recarregar(`/admin/empresas/${e}/extratos`);
  let destino: string;
  try {
    const f = fd.get('arquivo'); if (!(f instanceof File) || !f.size) throw new AppError('Selecione um arquivo.');
    const arqId = await enviarArquivo(a, { empresaId: e, exigenciaId, competencia: c, nome: f.name, dados: Buffer.from(await f.arrayBuffer()) });
    if (!(await exigenciaEhExtrato(a, e, exigenciaId).catch(() => false))) { await marcarExtratoVerificado('arquivos', arqId); destino = `${voltar}&ok=${encodeURIComponent('Arquivo registrado.')}`; }
    else {
      // Extrato bancário: além de registrar o documento, já leva os lançamentos para a conciliação e abre a conciliação
      try { const r = await lerExtratoDoDocumento(a, arqId); destino = urlConciliacao(`/admin/empresas/${e}/extratos`, r, { ok: `Arquivo registrado. ${resumoImportacao(r, c)}` }); }
      catch (x) { await marcarExtratoVerificado('arquivos', arqId).catch(() => {}); destino = `${voltar}&erro=${encodeURIComponent(`Arquivo registrado em Documentos do mês, mas não consegui levar os lançamentos para a conciliação: ${mensagemDeErro(x)}`)}`; }
    }
  } catch (x) { destino = `${voltar}&erro=${encodeURIComponent(mensagemDeErro(x))}`; }
  redirect(destino);
}
/** Botão "Ler na conciliação": lê (ou lê de novo) o extrato já anexado no documento e abre a conciliação com o resultado. */
export async function acaoLerExtratoDoDocumento(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia');
  const voltar = `/admin/empresas/${e}/documentos?competencia=${c}`; recarregar(voltar); recarregar(`/admin/empresas/${e}/extratos`);
  let destino: string;
  try { const r = await lerExtratoDoDocumento(a, s(fd, 'arquivoId')); destino = urlConciliacao(`/admin/empresas/${e}/extratos`, r, { ok: resumoImportacao(r, c) }); }
  catch (x) { destino = `${voltar}&erro=${encodeURIComponent(`Não consegui ler este extrato na conciliação: ${mensagemDeErro(x)}`)}`; }
  redirect(destino);
}
export async function acaoRemoverAvulsoAdmin(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia');
  await executar(`/admin/empresas/${e}/documentos?competencia=${c}#outros`, 'Arquivo retirado.', () => removerAvulso(a, s(fd, 'id')));
}
/** "Cobrar envio": manda a cobrança direto no WhatsApp do cliente pelo Digisac (não cria aviso no painel do cliente). */
export async function acaoCobrarDocumentos(fd: FormData) {
  const a = await exigirUsuario('admin'); const e = s(fd, 'empresaId'); const c = s(fd, 'competencia'); const volta = `/admin/entregas?competencia=${c}`;
  let destino: string;
  try {
    if (!(await digisacPronto())) throw new AppError('O WhatsApp pelo Digisac ainda não está configurado. Clique em "WhatsApp (Digisac)", cole a chave da API e escolha a conexão.');
    const z = (await pendenciasDoMes(c, false)).todas.find((x) => x.empresaId === e);
    if (!z) throw new AppError('Esta empresa já enviou todos os documentos do mês.');
    if (!z.whatsapp) throw new AppError(`${z.empresa} não tem WhatsApp cadastrado. Abra a empresa → Editar dados → "WhatsApp do cliente".`);
    try { await enviarWhatsappDigisac(z.whatsapp, (nomeContato) => z.mensagemPara(nomeContato)); }
    catch (x) {
      await registrar({ query } as never, { usuarioId: a.id, empresaId: e, acao: 'cobranca.whatsapp_falhou', entidade: 'empresa', entidadeId: e, detalhes: { competencia: c, canal: 'digisac', detalhe: mensagemDeErro(x).slice(0, 300) } });
      throw x;
    }
    await registrar({ query } as never, { usuarioId: a.id, empresaId: e, acao: 'cobranca.whatsapp_enviada', entidade: 'empresa', entidadeId: e, detalhes: { competencia: c, canal: 'digisac' } });
    destino = `${volta}&ok=${encodeURIComponent(`Cobrança enviada no WhatsApp de ${z.empresa} pelo Digisac.`)}`;
  } catch (x) { destino = `${volta}&erro=${encodeURIComponent(`Não cobrou: ${mensagemDeErro(x)}`)}`; }
  redirect(destino);
}
