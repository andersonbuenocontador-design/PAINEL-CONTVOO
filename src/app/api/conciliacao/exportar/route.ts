import ExcelJS from 'exceljs';
import { usuarioAtual } from '@/lib/session';
import { conferenciaSaldos, listarConciliacao, obterConciliacao } from '@/lib/services/conciliacao';
import { obterEmpresa } from '@/lib/services/empresas';
import { competenciaSchema } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';

export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || u.deve_trocar_senha) return new Response('Não autorizado', { status: 401 });
  const url = new URL(req.url); const empresaId = url.searchParams.get('empresaId') ?? ''; const comp = url.searchParams.get('competencia') ?? '';
  try {
    competenciaSchema.parse(comp);
    const emp = await obterEmpresa(u, empresaId); const ls = await listarConciliacao(u, empresaId, comp);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Conciliação');
    ws.columns = [{ header: 'Data', key: 'd', width: 12 }, { header: 'Banco', key: 'b', width: 16 }, { header: 'Descrição do banco', key: 'o', width: 44 }, { header: 'Código da conta', key: 'c', width: 14 }, { header: 'Conta contábil', key: 'n', width: 36 },
      { header: 'Classificação', key: 'k', width: 16 }, { header: 'Complemento', key: 'p', width: 36 }, { header: 'Entrada', key: 'e', width: 14 }, { header: 'Saída', key: 's', width: 14 }, { header: 'Confiança', key: 'f', width: 11 }, { header: 'Revisado', key: 'r', width: 10 }, { header: 'Motivo / observação', key: 'm', width: 50 }];
    ws.getRow(1).font = { bold: true };
    for (const l of ls) ws.addRow({ d: new Date(l.data + 'T00:00:00Z'), b: l.banco, o: l.descricao_original, c: l.conta_codigo ?? '', n: l.conta_nome ?? '', k: l.classificacao ?? '', p: l.complemento ?? '', e: l.valor > 0 ? l.valor / 100 : null, s: l.valor < 0 ? Math.abs(l.valor) / 100 : null,
      f: ({ A: 'Alta', M: 'Média', B: 'Baixa' })[l.confianca], r: l.revisado ? 'Sim' : 'Não', m: [l.motivo, l.observacao].filter(Boolean).join(' ') });
    const sd = wb.addWorksheet('Conferência de saldos');
    sd.columns = [{ header: 'Conta', key: 'c', width: 28 }, { header: 'Saldo inicial', key: 'i', width: 16 }, { header: 'Entradas', key: 'e', width: 16 }, { header: 'Saídas', key: 's', width: 16 }, { header: 'Saldo final calculado', key: 'k', width: 20 }, { header: 'Saldo final do extrato', key: 'x', width: 22 }, { header: 'Situação', key: 'u', width: 48 }];
    sd.getRow(1).font = { bold: true };
    const rs = (c: number | null) => (c == null ? null : c / 100);
    for (const s of await conferenciaSaldos(u, empresaId, comp)) sd.addRow({ c: `${s.banco}${s.conta ? ' · ' + s.conta : ''}`, i: rs(s.saldoInicial), e: rs(s.entradas), s: rs(Math.abs(s.saidas)), k: rs(s.saldoCalculado), x: rs(s.saldoFinalExtrato), u: s.confere === true ? 'Confere' : s.confere === false ? `Diverge em ${(Math.abs(s.diferenca ?? 0) / 100).toFixed(2)}` : 'Sem dados para conferir' });
    ['i', 'e', 's', 'k', 'x'].forEach((k) => (sd.getColumn(k).numFmt = '#,##0.00'));
    const st = (await obterConciliacao(u, empresaId, comp)).status; ws.addRow([]); ws.addRow({ o: `Situação da conciliação: ${({ revisao: 'Em revisão', enviada: 'Enviada ao escritório', devolvida: 'Devolvida para correção', concluida: 'Concluída' })[st]}` });
    ws.getColumn('d').numFmt = 'dd/mm/yyyy'; ws.getColumn('e').numFmt = '#,##0.00'; ws.getColumn('s').numFmt = '#,##0.00'; ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const nome = `conciliacao-${emp.razao_social.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}-${comp}.xlsx`;
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof AppError) return new Response('Não encontrado', { status: 404 });
    return new Response('Parâmetros inválidos', { status: 400 });
  }
}
