import { z } from 'zod';
import { autorizado, registrarCobrancaEnviada } from '@/lib/services/integracao';
import { AppError } from '@/lib/errors';

const corpo = z.object({ empresaId: z.string().uuid(), competencia: z.string(), enviada: z.boolean().default(true), detalhe: z.string().optional() });
/** Para o n8n: POST { empresaId, competencia, enviada, detalhe } depois de mandar a mensagem pelo Digisac. */
export async function POST(req: Request) {
  const a = autorizado(req);
  if (a === 'sem-token') return new Response('INTEGRACAO_TOKEN não configurado', { status: 503 });
  if (a === 'negado') return new Response('Não autorizado', { status: 401 });
  const d = corpo.safeParse(await req.json().catch(() => null));
  if (!d.success) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
  try { return Response.json(await registrarCobrancaEnviada(d.data)); }
  catch (e) { if (e instanceof AppError) return Response.json({ erro: e.message }, { status: 404 }); throw e; }
}
