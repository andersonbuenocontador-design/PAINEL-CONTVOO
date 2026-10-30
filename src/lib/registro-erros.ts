import { query } from './db';
import { mascarar } from './diagnostico';

/** Guarda um erro inesperado no banco (mensagem + 1ªs linhas da pilha, mascaradas). Nunca falha nem atrasa quem chamou. */
export function registrarErro(e: unknown, onde?: string) {
  try {
    const err = e as { message?: string; stack?: string; digest?: string };
    if (err?.digest?.startsWith?.('NEXT_REDIRECT') || err?.digest?.startsWith?.('NEXT_NOT_FOUND') || /NEXT_REDIRECT|NEXT_NOT_FOUND/.test(String(err?.message))) return;
    const pilha = (err?.stack ?? '').split('\n').slice(1, 5).map((l) => l.trim().replace(/\(.*?([^/\\]+:\d+:\d+)\)/, '($1)')).join(' | ');
    const msg = mascarar(`${err?.message ?? String(e)}${pilha ? ` || ${pilha}` : ''}`).slice(0, 900);
    void query('INSERT INTO erros_sistema(onde,mensagem) VALUES ($1,$2)', [onde?.slice(0, 200) ?? null, msg]).then(
      () => query(`DELETE FROM erros_sistema WHERE id < (SELECT max(id) - 500 FROM erros_sistema)`), () => {});
  } catch { /* nunca atrapalha */ }
}
