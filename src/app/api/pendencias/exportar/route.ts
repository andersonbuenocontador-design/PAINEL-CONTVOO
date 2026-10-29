import ExcelJS from 'exceljs';
import { usuarioAtual } from '@/lib/session';
import { listarPendenciasEscritorio, type FiltroPend } from '@/lib/services/pendencias';
import { AppError } from '@/lib/errors';
import { abaPendencias, bufferDe, XLSX_HEADERS } from '@/lib/exportar';

export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  const q = new URL(req.url).searchParams;
  try {
    const f: FiltroPend = { situacao: (q.get('situacao') || undefined) as FiltroPend['situacao'], categoria: (q.get('categoria') || undefined) as FiltroPend['categoria'], vencidas: q.get('vencidas') === '1', busca: q.get('busca') || undefined, competencia: q.get('competencia') || undefined };
    const wb = new ExcelJS.Workbook(); abaPendencias(wb, 'Pendências', await listarPendenciasEscritorio(u, f));
    return new Response(await bufferDe(wb), { headers: XLSX_HEADERS('pendencias.xlsx') });
  } catch (e) { return new Response(e instanceof AppError ? 'Acesso negado' : 'Parâmetros inválidos', { status: e instanceof AppError ? 403 : 400 }); }
}
