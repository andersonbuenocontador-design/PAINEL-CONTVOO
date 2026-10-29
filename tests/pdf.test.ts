import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lerExtrato, ExtratoIlegivel } from '../src/lib/extrato-parser';

const f = (n: string) => readFileSync('tests/fixtures/extratos-pdf/' + n);

describe('leitor de PDF (código do Conciliador Contvoo)', () => {
  it('layout de banco reconhecido (Banrisul fictício): lançamentos, sinais e conferência de saldo', async () => {
    const e = await lerExtrato('banrisul.pdf', f('banrisul_ficticio.pdf'));
    expect(e.formato).toBe('pdf'); expect(e.conta).toMatchObject({ banco: 'BANRISUL', agencia: '0001', conta: '12345-6' });
    expect(e.movimentos.map((m) => [m.data, m.valor])).toEqual([['2026-10-01', 150000], ['2026-10-02', -45000], ['2026-10-05', -3990], ['2026-10-05', 60000]]);
    expect(e.movimentos[0].descricao).toMatch(/PIX RECEBIDO/);
    expect(e.conferenciaSaldo).toMatchObject({ saldoAnterior: 200000, saldoFinalInformado: 361010, saldoCalculado: 361010, confere: true });
  });
  it('tabela genérica por colunas (cabeçalho Data/Histórico/Débito/Crédito/Saldo)', async () => {
    const e = await lerExtrato('x.pdf', f('tabela_generica_ficticia.pdf'));
    expect(e.movimentos.map((m) => [m.data, m.valor])).toEqual([['2026-10-01', 100000], ['2026-10-02', -30000], ['2026-10-03', -2550]]);
    expect(e.movimentos[1].descricao).toMatch(/ENERGIA/);
    expect(e.conferenciaSaldo?.confere).toBe(true);
  });
  it('PDF sem texto e arquivo inválido dão mensagens claras', async () => {
    await expect(lerExtrato('a.pdf', f('sem_texto.pdf'))).rejects.toThrow(/sem texto selecionável|digitalizado/);
    await expect(lerExtrato('a.pdf', Buffer.from('não sou pdf'))).rejects.toBeInstanceOf(ExtratoIlegivel);
  });
});
