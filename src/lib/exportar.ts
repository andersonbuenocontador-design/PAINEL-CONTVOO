import ExcelJS from 'exceljs';
import { CATEGORIAS, type Pend } from './services/pendencias';
import type { StatusConc } from './services/conciliacao';

export const SIT_PEND = { aberta: 'Aguardando o cliente', respondida: 'Aguardando o escritório', resolvida: 'Resolvida', cancelada: 'Cancelada' } as const;
export const SIT_CONC = { revisao: 'Cliente preenchendo', enviada: 'Aguardando conferência', devolvida: 'Devolvida ao cliente', concluida: 'Concluída' } as const;
const cab = (ws: ExcelJS.Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };
export function abaPendencias(wb: ExcelJS.Workbook, nome: string, ls: (Pend & { razao_social: string })[]) {
  const ws = wb.addWorksheet(nome);
  ws.columns = [{ header: 'Empresa', key: 'e', width: 40 }, { header: 'Categoria', key: 'c', width: 24 }, { header: 'Competência', key: 'k', width: 13 }, { header: 'Descrição', key: 'd', width: 60 }, { header: 'Prazo', key: 'p', width: 12 }, { header: 'Situação', key: 's', width: 24 }, { header: 'Vencida', key: 'v', width: 9 }, { header: 'Responsável', key: 'r', width: 22 }, { header: 'Criada em', key: 'a', width: 12 }, { header: 'Mensagens', key: 'm', width: 11 }];
  for (const p of ls) ws.addRow({ e: p.razao_social, c: CATEGORIAS[p.categoria], k: p.competencia ? `${p.competencia.slice(5)}/${p.competencia.slice(0, 4)}` : '', d: p.descricao, p: p.prazo ? new Date(p.prazo + 'T00:00:00Z') : null, s: SIT_PEND[p.situacao], v: p.vencida ? 'Sim' : 'Não', r: p.responsavel ?? '', a: new Date(p.criado_em), m: p.mensagens });
  ws.getColumn('p').numFmt = 'dd/mm/yyyy'; ws.getColumn('a').numFmt = 'dd/mm/yyyy'; cab(ws);
}
export function abaConciliacoes(wb: ExcelJS.Workbook, nome: string, fila: { razao_social: string; status: StatusConc; enviada_em: string | null; linhas: number; sem_conta: number; nao_rev: number; correcoes: number }[]) {
  const ws = wb.addWorksheet(nome);
  ws.columns = [{ header: 'Empresa', key: 'e', width: 44 }, { header: 'Situação', key: 's', width: 24 }, { header: 'Enviada em', key: 'd', width: 14 }, { header: 'Movimentações', key: 'l', width: 14 }, { header: 'Sem conta', key: 'c', width: 11 }, { header: 'Para revisar', key: 'r', width: 13 }, { header: 'Correções pedidas', key: 'k', width: 17 }];
  for (const f of fila) ws.addRow({ e: f.razao_social, s: SIT_CONC[f.status], d: f.enviada_em ? new Date(f.enviada_em) : null, l: f.linhas, c: f.sem_conta, r: f.nao_rev, k: f.correcoes });
  ws.getColumn('d').numFmt = 'dd/mm/yyyy'; cab(ws);
}
export const XLSX_HEADERS = (nome: string) => ({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'private, no-store' });
export const bufferDe = async (wb: ExcelJS.Workbook) => new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer()));
export function abaRetiradas(wb: ExcelJS.Workbook, empresa: string, competencia: string, r: { itens: { data: string; socio_nome: string; tipo: 'pro_labore' | 'lucros' | 'outras'; valor: string; observacao: string | null }[]; totais: { socio: string; pro_labore: number; lucros: number; outras: number; total: number }[]; total: number }) {
  const TIPOS = { pro_labore: 'Pró-labore', lucros: 'Distribuição de lucros', outras: 'Outras retiradas' } as const;
  const ws = wb.addWorksheet('Retiradas');
  ws.columns = [{ header: 'Data', key: 'd', width: 12 }, { header: 'Sócio', key: 's', width: 36 }, { header: 'Tipo', key: 't', width: 24 }, { header: 'Valor (R$)', key: 'v', width: 16 }, { header: 'Observação', key: 'o', width: 44 }];
  for (const i of r.itens) ws.addRow({ d: new Date(i.data + 'T00:00:00Z'), s: i.socio_nome, t: TIPOS[i.tipo], v: Number(i.valor), o: i.observacao ?? '' });
  ws.getColumn('d').numFmt = 'dd/mm/yyyy'; ws.getColumn('v').numFmt = '#,##0.00'; cab(ws);
  const t = wb.addWorksheet('Totais por sócio');
  t.columns = [{ header: 'Sócio', key: 's', width: 36 }, { header: 'Pró-labore', key: 'p', width: 15 }, { header: 'Lucros', key: 'l', width: 15 }, { header: 'Outras', key: 'o', width: 15 }, { header: 'Total', key: 't', width: 15 }];
  for (const x of r.totais) t.addRow({ s: x.socio, p: x.pro_labore, l: x.lucros, o: x.outras, t: x.total });
  t.addRow({ s: `TOTAL ${empresa} ${competencia.slice(5)}/${competencia.slice(0, 4)}`, t: r.total }).font = { bold: true };
  for (const k of ['p', 'l', 'o', 't']) t.getColumn(k).numFmt = '#,##0.00'; cab(t);
}
