import { usuarioAtual } from '@/lib/session';
import { baixarInforme } from '@/lib/services/informes';
import { AppError } from '@/lib/errors';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  const v = Number(new URL(req.url).searchParams.get('v')) || undefined;
  try {
    const { dados, nome } = await baixarInforme(u, (await params).id, v);
    return new Response(new Uint8Array(dados), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AppError) return new Response('Informe não encontrado', { status: 404 });
    console.error(e); return new Response('Erro', { status: 500 });
  }
}
