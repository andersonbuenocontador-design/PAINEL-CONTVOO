import { query } from '../db';
import { Actor, AppError, exigirAdmin } from '../errors';
import { registrar } from './auditoria';
import { MENSAGEM_PADRAO, TAMANHO_MAX_MENSAGEM } from '../mensagem-cobranca';

/** Texto da cobrança pelo WhatsApp escolhido pelo escritório (ou o padrão). */
export async function lerMensagemCobranca(): Promise<{ texto: string; personalizada: boolean }> {
  const v = (await query(`SELECT valor FROM configuracoes WHERE chave='mensagem_cobranca'`)).rows[0]?.valor as string | undefined;
  return v ? { texto: v, personalizada: true } : { texto: MENSAGEM_PADRAO, personalizada: false };
}
/** Salva o texto (null volta ao padrão). */
export async function salvarMensagemCobranca(actor: Actor, texto: string | null) {
  exigirAdmin(actor);
  if (texto === null) await query(`DELETE FROM configuracoes WHERE chave='mensagem_cobranca'`);
  else {
    const t = texto.replace(/\r\n/g, '\n').trim();
    if (!t) throw new AppError('Escreva a mensagem.');
    if (t.length > TAMANHO_MAX_MENSAGEM) throw new AppError(`Mensagem muito longa (máx. ${TAMANHO_MAX_MENSAGEM} caracteres).`);
    if (!t.includes('{documentos}')) throw new AppError('Coloque {documentos} na mensagem: é onde entra a lista do que falta.');
    await query(`INSERT INTO configuracoes(chave,valor,atualizado_por) VALUES ('mensagem_cobranca',$1,$2) ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()`, [t, actor.id]);
  }
  await registrar({ query } as never, { usuarioId: actor.id, acao: texto === null ? 'mensagem_cobranca.padrao' : 'mensagem_cobranca.salvar', entidade: 'configuracao' });
}
