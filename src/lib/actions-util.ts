import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { AppError } from './errors';

export function mensagemDeErro(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? 'Dados inválidos.';
  console.error(e);
  return 'Não foi possível concluir a operação. Tente novamente.';
}
/** Executa a ação e volta para `voltar` com ?erro= ou ?ok= (mensagens simples, sem dados sensíveis). Um #âncora em `voltar` fica no fim do endereço. */
export async function executar(voltar: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  const [base, ancora] = voltar.split('#'); const sep = base.includes('?') ? '&' : '?'; const fim = ancora ? `#${ancora}` : '';
  let destino: string;
  try { await fn(); destino = `${base}${sep}ok=${encodeURIComponent(ok)}${fim}`; }
  catch (e) { destino = `${base}${sep}erro=${encodeURIComponent(mensagemDeErro(e))}${fim}`; }
  redirect(destino);
}
