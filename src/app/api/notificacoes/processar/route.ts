import { timingSafeEqual } from 'node:crypto';
import { gerarLembretes, processarFila } from '@/lib/notificacoes';

/** Para agendador externo (cron): POST com "Authorization: Bearer <CRON_SECRET>". Gera lembretes de prazo e envia a fila. */
async function executar(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || segredo.length < 24) return new Response('CRON_SECRET não configurado', { status: 503 });
  const recebido = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(recebido), b = Buffer.from(segredo);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response('Não autorizado', { status: 401 });
  const lembretes = await gerarLembretes(); const r = await processarFila();
  return Response.json({ lembretes, ...r });
}

/** POST (cron externo) e GET (agendadores que só chamam GET, como o cron da Vercel) — ambos exigem o Bearer. */
export const POST = executar;
export const GET = executar;
