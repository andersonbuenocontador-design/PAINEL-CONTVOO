import { query } from '@/lib/db';
import { armazenamentoOk } from '@/lib/storage';
import { diagnosticar, problemaNoInicio } from '@/lib/diagnostico';

/** Para monitoramento. Não exige login e não expõe dados: só ok/falha do banco e do armazenamento e, se houver,
 *  o motivo de configuração em português (sem senhas), para o dono do sistema corrigir no Render. */
export const dynamic = 'force-dynamic';
export async function GET() {
  const r: { ok: boolean; banco: boolean; armazenamento: boolean; problema?: string } = { ok: true, banco: false, armazenamento: false };
  const problemas: string[] = [];
  try { await query('SELECT 1'); r.banco = true; } catch (e) { problemas.push(diagnosticar(e, 'banco')); }
  r.armazenamento = await armazenamentoOk();
  if (!r.armazenamento) problemas.push(process.env.SUPABASE_URL ? 'armazenamento: o Supabase Storage não respondeu (confira SUPABASE_URL e SUPABASE_SECRET_KEY no Render).' : 'armazenamento: faltam SUPABASE_URL e SUPABASE_SECRET_KEY no Render (Environment).');
  const inicio = problemaNoInicio(); if (inicio && (!r.banco || !r.armazenamento || /admin:/.test(inicio))) problemas.unshift(inicio);
  r.ok = r.banco && r.armazenamento;
  if (problemas.length) r.problema = [...new Set(problemas)].join(' | ');
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
