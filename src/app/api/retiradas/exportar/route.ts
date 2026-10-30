import ExcelJS from 'exceljs';
import { usuarioAtual } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarRetiradas } from '@/lib/services/retiradas';
import { abaRetiradas, bufferDe, XLSX_HEADERS } from '@/lib/exportar';
import { AppError } from '@/lib/errors';

/** Planilha das retiradas de uma empresa num mês (escritório e cliente da própria empresa). */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  const q = new URL(req.url).searchParams; const empresaId = q.get('empresaId') ?? '', comp = q.get('competencia') ?? '';
  try {
    const e = await obterEmpresa(u, empresaId); const r = await listarRetiradas(u, empresaId, comp);
    const wb = new ExcelJS.Workbook(); abaRetiradas(wb, e.razao_social, comp, r);
    return new Response(await bufferDe(wb), { headers: XLSX_HEADERS(`retiradas-${comp}.xlsx`) });
  } catch (x) {
    if (x instanceof AppError || (x as Error)?.name === 'ZodError') return new Response('Não encontrado', { status: 404 });
    console.error(x); return new Response('Erro', { status: 500 });
  }
}
