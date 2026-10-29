import ExcelJS from 'exceljs';
import { usuarioAtual } from '@/lib/session';
import { listarConciliacoesEscritorio } from '@/lib/services/conciliacao';
import { AppError } from '@/lib/errors';

const ROT = { revisao: 'Cliente preenchendo', enviada: 'Aguardando conferência', devolvida: 'Devolvida ao cliente', concluida: 'Concluída' } as const;
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  const comp = new URL(req.url).searchParams.get('competencia') ?? '';
  try {
    const fila = await listarConciliacoesEscritorio(u, comp);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(`Conciliações ${comp}`);
    ws.columns = [{ header: 'Empresa', key: 'e', width: 44 }, { header: 'Situação', key: 's', width: 24 }, { header: 'Enviada em', key: 'd', width: 14 }, { header: 'Movimentações', key: 'l', width: 14 }, { header: 'Sem conta', key: 'c', width: 11 }, { header: 'Para revisar', key: 'r', width: 13 }, { header: 'Correções pedidas', key: 'k', width: 17 }];
    ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const f of fila) ws.addRow({ e: f.razao_social, s: ROT[f.status], d: f.enviada_em ? new Date(f.enviada_em) : null, l: f.linhas, c: f.sem_conta, r: f.nao_rev, k: f.correcoes });
    ws.getColumn('d').numFmt = 'dd/mm/yyyy';
    return new Response(new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer())), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="conciliacoes-${comp}.xlsx"`, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AppError) return new Response('Acesso negado', { status: e.code === 'proibido' ? 403 : 404 });
    return new Response('Parâmetros inválidos', { status: 400 });
  }
}
