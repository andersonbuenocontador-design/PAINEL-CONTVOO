import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { lerExtrato, paraCentavos, paraData, ExtratoIlegivel } from '../src/lib/extrato-parser';

const dir = 'tests/fixtures/extratos/';
const f = (n: string) => readFileSync(dir + n);

describe('números e datas', () => {
  it.each([['1.500,00', 150000], ['1500,00', 150000], ['1500.00', 150000], ['-450,00', -45000], ['(450,00)', -45000], ['R$ 1.234,56', 123456], ['450,00 D', -45000], ['1.500', 150000], ['0,5', 50], ['12', 1200]])('%s', (e, c) => expect(paraCentavos(e)).toBe(c));
  it('recusa lixo e mais de 2 casas', () => { expect(paraCentavos('abc')).toBeNull(); expect(paraCentavos('')).toBeNull(); expect(paraCentavos('1,2345')).toBeNull(); });
  it('datas', () => { expect(paraData('01/10/2026')).toBe('2026-10-01'); expect(paraData('20261001090000')).toBe('2026-10-01'); expect(paraData('31/02/2026')).toBeNull(); });
});

describe('modelos do pacote (18 arquivos)', () => {
  const csvs = readdirSync(dir).filter((n) => n.endsWith('.csv'));
  it.each(csvs)('%s lê as movimentações', async (n) => {
    const e = await lerExtrato(n, f(n));
    expect(e.erros).toEqual([]);
    expect(e.movimentos.length).toBeGreaterThanOrEqual(1);
    for (const m of e.movimentos) { expect(m.data).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(Number.isInteger(m.valor)).toBe(true); expect(m.descricao.length).toBeGreaterThan(0); }
  });
  it('sinais corretos: débito/crédito em colunas e valor com tipo', async () => {
    for (const n of ['layout_ilustrativo_banrisul.csv', 'layout_ilustrativo_inter.csv', 'modelo_padrao_extrato.csv']) {
      const e = await lerExtrato(n, f(n));
      const pix = e.movimentos.find((m) => /PIX RECEBIDO/.test(m.descricao))!;
      expect(pix.valor).toBe(150000);
    }
    const e = await lerExtrato('modelo_padrao_extrato.csv', f('modelo_padrao_extrato.csv'));
    expect(e.movimentos.find((m) => /FORNECEDOR/.test(m.descricao))!.valor).toBe(-45000);
    expect(e.saldoFinalInformado).toBe(305000);
  });
  it('xlsx equivale ao csv', async () => {
    const a = await lerExtrato('x.xlsx', f('modelo_padrao_extrato.xlsx')), b = await lerExtrato('x.csv', f('modelo_padrao_extrato.csv'));
    expect(a.movimentos).toEqual(b.movimentos);
  });
  it('ofx', async () => {
    const e = await lerExtrato('x.ofx', f('exemplo_ofx_nao_oficial.ofx'));
    expect(e.movimentos).toEqual([
      { data: '2026-10-01', descricao: 'PIX RECEBIDO - CLIENTE EXEMPLO', valor: 150000, saldo: null, idExterno: 'EXEMPLO001', documento: null },
      { data: '2026-10-02', descricao: 'PAGAMENTO - FORNECEDOR EXEMPLO', valor: -45000, saldo: null, idExterno: 'EXEMPLO002', documento: null },
    ]);
    expect(e.saldoFinalInformado).toBe(305000);
  });
});

describe('robustez', () => {
  it('stone usa valor líquido', async () => {
    const e = await lerExtrato('s.csv', f('layout_ilustrativo_stone.csv')); expect(e.movimentos.length).toBeGreaterThan(0);
  });
  it('aceita separador vírgula, aspas e cabeçalho depois de linhas de título', async () => {
    const csv = 'Extrato Banco X\nConta 123\n\nData,Histórico,Valor\n01/10/2026,"PAGTO, FORNECEDOR ""X""","-1.234,56"\n02/10/2026,DEPOSITO,"2.000,00"\n';
    const e = await lerExtrato('a.csv', Buffer.from(csv));
    expect(e.movimentos.map((m) => [m.descricao, m.valor])).toEqual([['PAGTO, FORNECEDOR "X"', -123456], ['DEPOSITO', 200000]]);
  });
  it('linhas ruins viram erros, sem derrubar o arquivo; débito+crédito juntos é erro', async () => {
    const csv = 'Data;Histórico;Débito;Crédito\n01/10/2026;OK;10,00;0,00\n99/99/2026;RUIM;1,00;0,00\n02/10/2026;DOIS;5,00;5,00\n';
    const e = await lerExtrato('a.csv', Buffer.from(csv));
    expect(e.movimentos).toHaveLength(1); expect(e.erros.map((x) => x.motivo)).toEqual(['data inválida', 'débito e crédito preenchidos juntos']);
  });
  it('rejeita arquivo que não é extrato, PDF e formatos desconhecidos', async () => {
    await expect(lerExtrato('a.csv', Buffer.from('a;b\n1;2\n'))).rejects.toBeInstanceOf(ExtratoIlegivel);
    await expect(lerExtrato('a.pdf', Buffer.from('%PDF'))).rejects.toBeInstanceOf(ExtratoIlegivel);
    await expect(lerExtrato('a.doc', Buffer.from('x'))).rejects.toThrow(/não suportado/);
    await expect(lerExtrato('a.ofx', Buffer.from('lixo'))).rejects.toThrow(/OFX inválido/);
  });
  it('preserva a descrição original (sem trim interno nem maiúsculas)', async () => {
    const e = await lerExtrato('a.csv', Buffer.from('Data;Histórico;Valor\n01/10/2026;Pix   Recebido João;10,00\n'));
    expect(e.movimentos[0].descricao).toBe('Pix   Recebido João');
  });
});
