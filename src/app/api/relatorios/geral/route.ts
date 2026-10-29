import ExcelJS from 'exceljs';
import { usuarioAtual } from '@/lib/session';
import { visaoGeral } from '@/lib/services/documentos';
import { listarConciliacoesEscritorio } from '@/lib/services/conciliacao';
import { listarPendenciasEscritorio } from '@/lib/services/pendencias';
import { AppError } from '@/lib/errors';
import { abaConciliacoes, abaPendencias, bufferDe, XLSX_HEADERS } from '@/lib/exportar';

export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  const comp = new URL(req.url).searchParams.get('competencia') ?? '';
  try {
    const wb = new ExcelJS.Workbook();
    const docs = wb.addWorksheet('Documentos'); docs.columns = [{ header: 'Empresa', key: 'e', width: 44 }, { header: 'Exigidos', key: 'x', width: 10 }, { header: 'Enviados', key: 'n', width: 10 }, { header: 'Aprovados', key: 'a', width: 11 }, { header: 'Rejeitados', key: 'r', width: 11 }, { header: 'Pendentes', key: 'p', width: 11 }, { header: '% concluído', key: 'c', width: 12 }];
    docs.getRow(1).font = { bold: true };
    for (const d of await visaoGeral(u, comp)) docs.addRow({ e: d.razao_social, x: d.exigidos, n: d.enviados, a: d.aprovados, r: d.rejeitados, p: d.pendentes, c: d.percentual / 100 });
    docs.getColumn('c').numFmt = '0%';
    abaConciliacoes(wb, 'Conciliações', await listarConciliacoesEscritorio(u, comp));
    abaPendencias(wb, 'Pendências em andamento', await listarPendenciasEscritorio(u, { situacao: 'em_andamento' }));
    return new Response(await bufferDe(wb), { headers: XLSX_HEADERS(`relatorio-geral-${comp}.xlsx`) });
  } catch (e) { return new Response(e instanceof AppError ? 'Acesso negado' : 'Parâmetros inválidos', { status: e instanceof AppError ? 403 : 400 }); }
}
