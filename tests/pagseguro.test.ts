import { describe, expect, it } from 'vitest';
import { ehPagSeguro, lerPagSeguro } from '../src/lib/pdf/pagseguro';

// Linhas como o pdf.js entrega o "Extrato da conta" do PagSeguro (dados fictícios); ys = posição vertical (maior = mais acima)
const L = (pares: [number, string][]) => Object.assign(pares.map((p) => p[1]), { ys: pares.map((p) => p[0]) });
const extrato = L([
  [800, '290 - PagSeguro Internet S/A'], [790, 'Agência 0001'], [780, 'Conta 12345678-9'], [770, 'Extrato da conta'], [760, 'Periodo: 01/07/2026 a 31/07/2026'],
  [700, 'Data             Descrição                                        Valor'],
  [680, '01/07/2026           Pix enviado - Fulano De Tal                                        -R$ 3.900,00'],
  [660, '01/07/2026           Pix recebido - Cliente Exemplo                                        R$ 7.350,00'],
  [640, '01/07/2026           Saldo do dia                                        R$ 3.450,00'],
  [623, 'Cobrança Seguro Cartão Protegido - Para: PAGSEGURO INTERNET INSTITUICAO DE'],
  [618, '03/07/2026                                        -R$ 7,90'],
  [614, 'PAGAMENTO'],
  [600, '03/07/2026          Vendas - Disponivel CREDITO MASTERCARD                                        R$ 1.000,00'],
  [580, '03/07/2026           Saldo do dia                                        R$ 4.442,10'],
  [-9300, 'Data             Descrição                                        Valor'],
  [-9320, '04/07/2026           Pix enviado - Fornecedor Ltda                                        -R$ 442,10'],
  [-9340, '04/07/2026           Saldo do dia                                        R$ 4.000,00'],
]);

describe('extrato PagSeguro em PDF', () => {
  it('reconhece o layout', () => { expect(ehPagSeguro(extrato)).toBe(true); expect(ehPagSeguro(L([[1, 'BANRISUL'], [0, 'Extrato']]))).toBe(false); });
  it('lê lançamentos, junta descrição quebrada em duas linhas e ignora "Saldo do dia"', () => {
    const r = lerPagSeguro(extrato);
    expect(r).toMatchObject({ banco: 'PAGSEGURO', agencia: '0001', conta: '12345678-9' });
    expect(r.lancamentos).toEqual([
      { data: '01/07/2026', historico: 'Pix enviado - Fulano De Tal', valor: 3900, tipo: 'D' },
      { data: '01/07/2026', historico: 'Pix recebido - Cliente Exemplo', valor: 7350, tipo: 'C' },
      { data: '03/07/2026', historico: 'Cobrança Seguro Cartão Protegido - Para: PAGSEGURO INTERNET INSTITUICAO DE PAGAMENTO', valor: 7.9, tipo: 'D' },
      { data: '03/07/2026', historico: 'Vendas - Disponivel CREDITO MASTERCARD', valor: 1000, tipo: 'C' },
      { data: '04/07/2026', historico: 'Pix enviado - Fornecedor Ltda', valor: 442.1, tipo: 'D' },
    ]);
  });
  it('confere o saldo de cada dia e aponta o dia que não fecha', () => {
    const r = lerPagSeguro(extrato);
    expect([r.saldoAnterior, r.saldoFinal, r.diasDivergentes]).toEqual([0, 4000, []]);
    const errado = L(extrato.map((l, i) => [extrato.ys[i], l.replace('R$ 4.442,10', 'R$ 4.400,00')] as [number, string]));
    expect(lerPagSeguro(errado).diasDivergentes).toEqual(['03/07/2026', '04/07/2026']); // o dia seguinte parte do saldo impresso errado
  });
});
