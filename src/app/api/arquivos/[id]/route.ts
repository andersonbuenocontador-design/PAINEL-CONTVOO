import { usuarioAtual } from '@/lib/session';
import { baixarArquivo } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  try {
    const { dados, nome } = await baixarArquivo(u, (await params).id);
    return new Response(new Uint8Array(dados), { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    } });
  } catch (e) {
    if (e instanceof AppError) return new Response('Arquivo não encontrado', { status: 404 });
    console.error(e); return new Response('Erro', { status: 500 });
  }
}
