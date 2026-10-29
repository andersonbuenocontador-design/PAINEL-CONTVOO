import { usuarioAtual } from '@/lib/session';
import { exportarDadosUsuario } from '@/lib/services/lgpd';
import { AppError } from '@/lib/errors';

export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  try {
    const d = await exportarDadosUsuario(u, new URL(req.url).searchParams.get('usuarioId') ?? '');
    return new Response(JSON.stringify(d, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="dados-do-titular.json"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) { return new Response(e instanceof AppError ? (e.code === 'proibido' ? 'Acesso negado' : 'Não encontrado') : 'Erro', { status: e instanceof AppError ? (e.code === 'proibido' ? 403 : 404) : 500 }); }
}
