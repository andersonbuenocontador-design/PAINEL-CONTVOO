import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANCOS, bancoDe, tipoDocumento } from '../src/lib/bancos';

describe('marca do banco nos documentos pedidos', () => {
  it('reconhece o banco pelo nome ou instituição (com e sem acento)', () => {
    const casos: [string, string | null][] = [['EXTRATO — NUBANK', 'nubank'], ['Extrato Itaú', 'itau'], ['EXTRATO ITAU', 'itau'], ['Extrato Banco do Brasil', 'bb'], ['Extrato Inter', 'inter'],
      ['Extrato Intex', null], ['Extrato PagSeguro', 'pagbank'], ['Extrato Sicredi', 'sicredi'], ['Extrato Efí', 'efi'], ['Folha de pagamento', null]];
    for (const [t, k] of casos) expect(bancoDe(t)?.chave ?? null, t).toBe(k);
    expect(bancoDe(null, 'Extrato conta corrente')).toBeNull(); expect(bancoDe('Banrisul', 'Extrato')?.chave).toBe('banrisul');
  });
  it('todo banco da lista tem o arquivo do logo', () => {
    for (const b of BANCOS) expect(existsSync(`public${b.logo}`), b.chave).toBe(true);
  });
  it('tipo do documento sem banco', () => {
    expect(tipoDocumento('Folha de pagamento')).toBe('folha'); expect(tipoDocumento('Notas fiscais de compra')).toBe('nota');
    expect(tipoDocumento('Guia do DAS')).toBe('guia'); expect(tipoDocumento('Contrato social')).toBe('contrato'); expect(tipoDocumento('Relatório')).toBe('outro');
  });
});
