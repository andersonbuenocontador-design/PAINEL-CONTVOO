import { timingSafeEqual } from 'node:crypto';
import { executarAgenda } from '@/lib/services/gclick-solicitacao';

/** Agendador (GitHub Actions, de hora em hora): "Authorization: Bearer <CRON_SECRET>". Se for o dia/hora marcados, faz a solicitação de documentos do G-Click.
 *  Responde na hora e continua o envio em segundo plano (centenas de tarefas levam alguns minutos). */
export const dynamic = 'force-dynamic';
async function executar(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || segredo.length < 24) return new Response('CRON_SECRET não configurado', { status: 503 });
  const recebido = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(recebido), b = Buffer.from(segredo);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response('Não autorizado', { status: 401 });
  const trabalho = executarAgenda().catch((e) => { console.error('[gclick agendado]', e); return { rodou: false as const, motivo: 'erro' }; });
  const r = await Promise.race([trabalho, new Promise<null>((ok) => setTimeout(() => ok(null), 20000))]);
  return Response.json(r ?? { rodou: true, motivo: 'enviando em segundo plano' });
}
export const POST = executar;
export const GET = executar;
