import { access, constants, mkdir } from 'node:fs/promises';
import { query } from '@/lib/db';
import { resolve, join } from 'node:path';

/** Para monitoramento/balanceador. Não exige login e não expõe nenhum dado: só "ok" ou "falha" do banco e do armazenamento. */
export const dynamic = 'force-dynamic';
export async function GET() {
  const r = { ok: true, banco: false, armazenamento: false };
  try { await query('SELECT 1'); r.banco = true; } catch { /* falha registrada abaixo */ }
  try { const dir = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), 'storage')); await mkdir(dir, { recursive: true }); await access(dir, constants.W_OK); r.armazenamento = true; } catch { r.armazenamento = false; }
  r.ok = r.banco && r.armazenamento;
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
