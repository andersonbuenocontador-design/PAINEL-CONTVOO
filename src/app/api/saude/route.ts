import { query } from '@/lib/db';
import { armazenamentoOk } from '@/lib/storage';
import { conferirVariaveis, diagnosticar, problemaNoInicio } from '@/lib/diagnostico';

/** Para monitoramento. Não exige login e não expõe dados: só ok/falha do banco e do armazenamento e, se houver,
 *  o motivo de configuração em português (sem senhas), para o dono do sistema corrigir no Render. */
export const dynamic = 'force-dynamic';
export async function GET() {
  const r: { ok: boolean; banco: boolean; armazenamento: boolean; problema?: string } = { ok: true, banco: false, armazenamento: false };
  const problemas: string[] = [];
  try { await query('SELECT 1'); r.banco = true; } catch (e) { problemas.push(diagnosticar(e, 'banco')); }
  // No Render o disco é apagado a cada publicação: lá, documento só fica guardado no Supabase Storage.
  const discoTemporario = !!process.env.RENDER && !(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  r.armazenamento = !discoTemporario && await armazenamentoOk();
  const inicio = problemaNoInicio();
  if (!r.armazenamento && !inicio?.includes('armazenamento:')) problemas.push(process.env.SUPABASE_URL ? 'armazenamento: o Supabase Storage não respondeu (confira SUPABASE_URL e SUPABASE_SECRET_KEY no Render).' : `armazenamento: ${conferirVariaveis([{ nome: 'SUPABASE_URL' }, { nome: 'SUPABASE_SECRET_KEY' }]).join('; ')}.`);
  if (inicio && (!r.banco || !r.armazenamento || /admin:/.test(inicio))) problemas.unshift(inicio);
  r.ok = r.banco && r.armazenamento;
  if (problemas.length) r.problema = [...new Set(problemas)].join(' | ');
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
