import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { AppError } from './errors';
import { registrarErro } from './registro-erros';

export function mensagemDeErro(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? 'Dados inválidos.';
  console.error(e); registrarErro(e, 'ação');
  return 'Não foi possível concluir a operação. Tente novamente.';
}
/** Executa a ação e volta para `voltar` com ?erro= ou ?ok= (mensagens simples, sem dados sensíveis). Um #âncora em `voltar` fica no fim do endereço. */
export async function executar(voltar: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  const [base, ancora] = voltar.split('#'); const sep = base.includes('?') ? '&' : '?'; const fim = ancora ? `#${ancora}` : '';
  let destino: string;
  try { await fn(); destino = `${base}${sep}ok=${encodeURIComponent(ok)}${fim}`; }
  catch (e) { destino = `${base}${sep}erro=${encodeURIComponent(mensagemDeErro(e))}${fim}`; }
  recarregar(base);
  redirect(destino);
}

/** Força a página de destino a buscar dados novos. Sem isso, voltar para o MESMO endereço (ex.: duas mensagens "Arquivo enviado." seguidas)
 *  reaproveita a tela anterior e a lista não atualiza. */
export function recarregar(endereco: string) {
  try { revalidatePath(endereco.split('?')[0].split('#')[0]); } catch { /* fora de uma ação do servidor */ }
}
