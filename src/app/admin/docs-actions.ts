'use server';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { cobrarDocumentos } from '@/lib/services/cobranca';
import { executar, mensagemDeErro } from '@/lib/actions-util';
import { aplicarModelo, conferirArquivo, criarExigencia, criarModeloDeEmpresa, definirExigenciaAtiva, editarExigencia, enviarArquivo, removerAvulso } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';
import { digisacPronto, enviarWhatsappDigisac } from '@/lib/services/digisac';
import { pendenciasDoMes } from '@/lib/services/integracao';
import { registrar } from '@/lib/services/auditoria';
import { query } from '@/lib/db';
import { retirarLancamentosDoArquivo } from '@/lib/services/extratos';

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
  try {
    const r = await cobrarDocumentos(a, e, c);
    let msg = r.lembrete ? 'Lembrete enviado ao painel do cliente.' : 'Cobrança enviada ao painel do cliente.';
    // Digisac ligado e empresa com WhatsApp: a mensagem sai sozinha pelo WhatsApp do escritório.
    if (await digisacPronto()) {
      const z = (await pendenciasDoMes(c, false)).todas.find((x) => x.empresaId === e);
      if (z?.whatsapp) {
        try {
          await enviarWhatsappDigisac(z.whatsapp, z.mensagem);
          await registrar({ query } as never, { usuarioId: a.id, empresaId: e, acao: 'cobranca.whatsapp_enviada', entidade: 'empresa', entidadeId: e, detalhes: { competencia: c, canal: 'digisac' } });
          msg += ' E enviada no WhatsApp pelo Digisac.';
        } catch (x) {
          await registrar({ query } as never, { usuarioId: a.id, empresaId: e, acao: 'cobranca.whatsapp_falhou', entidade: 'empresa', entidadeId: e, detalhes: { competencia: c, canal: 'digisac', detalhe: mensagemDeErro(x).slice(0, 300) } });
          destino = `${volta}&erro=${encodeURIComponent(`${msg} Mas o WhatsApp não foi: ${mensagemDeErro(x)}`)}`; redirect(destino);
        }
      } else msg += ' (Sem WhatsApp cadastrado: não foi pelo WhatsApp.)';
    }
    destino = `${volta}&ok=${encodeURIComponent(msg)}`;
  }
  catch (x) { if (x && typeof x === 'object' && 'digest' in x && String((x as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw x; destino = `${volta}&erro=${encodeURIComponent(mensagemDeErro(x))}`; }
  redirect(destino);
}
