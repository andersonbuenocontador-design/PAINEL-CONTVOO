import { autorizado, extratosPendentes } from '@/lib/services/integracao';

/** Para o n8n: GET ?competencia=AAAA-MM (padrão: mês anterior) com "Authorization: Bearer <INTEGRACAO_TOKEN>". */
export async function GET(req: Request) {
  const a = autorizado(req);
  if (a === 'sem-token') return new Response('INTEGRACAO_TOKEN não configurado', { status: 503 });
  if (a === 'negado') return new Response('Não autorizado', { status: 401 });
  const hoje = new Date(Date.now() - 3 * 3600_000); const ant = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const comp = new URL(req.url).searchParams.get('competencia') || ant.toISOString().slice(0, 7);
  try { return Response.json(await extratosPendentes(comp)); }
  catch { return Response.json({ erro: 'Competência inválida. Use AAAA-MM.' }, { status: 400 }); }
}
