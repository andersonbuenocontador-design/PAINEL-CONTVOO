import { query } from '@/lib/db';
import { armazenamentoOk } from '@/lib/storage';

/** Para monitoramento/balanceador. Não exige login e não expõe nenhum dado: só "ok" ou "falha" do banco e do armazenamento. */
export const dynamic = 'force-dynamic';
export async function GET() {
  const r = { ok: true, banco: false, armazenamento: false };
  try { await query('SELECT 1'); r.banco = true; } catch { /* falha registrada abaixo */ }
  r.armazenamento = await armazenamentoOk();
  r.ok = r.banco && r.armazenamento;
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
