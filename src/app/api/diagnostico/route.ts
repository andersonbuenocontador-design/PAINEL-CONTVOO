import { timingSafeEqual } from 'node:crypto';
import { getPool } from '@/lib/db';
import { relatorioDiagnostico } from '@/lib/diagnostico-producao';

/** Diagnóstico para o workflow "Diagnóstico" do GitHub: exige "Authorization: Bearer <CRON_SECRET>". Só situações, contagens e erros mascarados. */
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || segredo.length < 24) return new Response('CRON_SECRET não configurado', { status: 503 });
  const a = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')), b = Buffer.from(segredo);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response('Não autorizado', { status: 401 });
  return Response.json(await relatorioDiagnostico(getPool()), { headers: { 'Cache-Control': 'no-store' } });
}
