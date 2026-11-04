import { describe, expect, it } from 'vitest';
import { ehStone, lerStone } from '../src/lib/pdf/stone';

// Página fictícia no layout do extrato da Stone (texto com posição x/y, como o pdf.js entrega)
const c = (x0: number, s: string) => ({ x0, x1: x0 + s.length * 5, s });
const L = (y: number, ...cs: { x0: number; x1: number; s: string }[]) => ({ y, cs });
const pagina = [
  L(784, c(77, 'Extrato de conta corrente')),
  L(667, c(36, 'Instituição'), c(404, 'Agência'), c(457, 'Conta')),
  L(652, c(36, 'Stone Instituição de Pagamento S.A.'), c(404, '0001'), c(457, '123​45-6')),
  L(590, c(20, 'DATA'), c(75, 'TIPO'), c(130, 'DESCRIÇÃO'), c(300, 'VALOR'), c(380, 'SALDO'), c(460, 'CONTRAPARTE')),
  // mais recente primeiro; nome em 2 linhas, repetido na coluna CONTRAPARTE
  L(571, c(130, 'FORNECEDOR FICTICIO'), c(460, 'FORNECEDOR FICTICIO')),
  L(565, c(130, 'COMERCIO LTDA')),
  L(559, c(20, '31/07/26'), c(75, 'Saída'), c(290, '- R$ 1.000,50'), c(380, 'R$ 499,50'), c(460, 'COMERCIO LTDA')),
  L(553, c(130, 'Pagamento')),
  L(529, c(130, 'Cliente Teste da Silva')),
  L(523, c(20, '30/07/26'), c(75, 'Entrada'), c(295, 'R$ 300,00'), c(380, 'R$ 1.500,00')),
  L(517, c(130, 'Transferência | Pix')),
  L(493, c(130, 'Rendimento automático')),
  L(487, c(20, '29/07/26'), c(75, 'Entrada'), c(295, 'R$ 0,01'), c(380, 'R$ 1.200,00')),
  L(481, c(130, 'Rendimento')),
  L(300, c(20, 'Informações do Comprovante')),
];

describe('extrato Stone', () => {
  it('reconhece o layout', () => {
    expect(ehStone(['Extrato de conta corrente', 'Stone Instituição de Pagamento S.A.   0001'])).toBe(true);
    expect(ehStone(['Extrato da conta', 'PagSeguro Internet'])).toBe(false);
  });
  it('junta o nome das linhas do bloco, separa tipo, valor e saldo e calcula o saldo anterior', () => {
    const r = lerStone([pagina]);
    expect(r).toMatchObject({ banco: 'STONE', agencia: '0001', conta: '12345-6', saldoFinal: 499.5 });
    expect(r.lancamentos).toEqual([
      { data: '29/07/2026', historico: 'Rendimento - Rendimento automático', valor: 0.01, tipo: 'C' },
      { data: '30/07/2026', historico: 'Transferência | Pix - Cliente Teste da Silva', valor: 300, tipo: 'C' },
      { data: '31/07/2026', historico: 'Pagamento - FORNECEDOR FICTICIO COMERCIO LTDA', valor: 1000.5, tipo: 'D' },
    ]);
    expect(r.saldoAnterior).toBe(1199.99); // 1.200,00 depois do rendimento de 0,01
  });
});
