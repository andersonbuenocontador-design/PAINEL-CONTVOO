import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import { criarSocio } from '../src/lib/services/informes';
import { enviarRetiradas, lancarRetirada, listarRetiradas } from '../src/lib/services/retiradas';
import * as X from '../src/lib/services/extratos';
import * as K from '../src/lib/services/conciliacao';
import { citaCpf, citaNome, compararRetiradas, contaDeRetirada, desfazerNaoRetirada, marcarNaoRetirada, visaoLucros } from '../src/lib/services/lucros';
import type { Actor } from '../src/lib/errors';

const C = '2026-10';
let admin: Actor, ua: Actor, empA: string, empB: string, nubank: string, sicredi: string;
const PLANO = `
Referencial
   11   1.1.1.01.0001   BANCO NUBANK                        01/01/2020
   21   3.2.1.01.0001   TARIFAS BANCARIAS
   90   2.4.1.01.0002   DISTRIBUICAO DE LUCROS
`;
const csv = (linhas: string[]) => Buffer.from('Data;Histórico;Valor\n' + linhas.join('\n') + '\n');
async function extrato(conta: string, linhas: string[]) {
  const id = await X.criarPrevia(ua, { empresaId: empA, contaId: conta, competencia: C, nome: 'e.csv', dados: csv(linhas) });
  await X.confirmarImportacao(ua, id, []);
}
const ret = (data: string, socio: string, valor: string, origem: string) => lancarRetirada(ua, empA, C, { data, socio, tipo: 'lucros', valor, origem });

beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE retiradas_ignoradas, retiradas_envios, retiradas, socio_usuarios, socios, participantes, dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  ua = { id: await criarUsuario(admin, { nome: 'Cliente A', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
  nubank = await X.criarConta(admin, empA, { banco: 'Nubank' });
  sicredi = await X.criarConta(admin, empA, { banco: 'Sicredi' });
  await K.importarPlano(admin, empA, PLANO);
  await criarSocio(admin, empA, { nome: 'Liliana de Lima Neves', cpf: '529.712.440-91' } as never);
});
afterAll(() => getPool().end());

describe('reconhecimento na descrição do banco', () => {
  it('nome (primeiro e último), CPF inteiro ou mascarado, conta do plano', () => {
    expect(citaNome('Transferência enviada pelo Pix - LILIANA LIMA NEVES - •••.712.440-•• - NUBANK', 'Liliana de Lima Neves')).toBe(true);
    expect(citaNome('PIX ENVIADO LILIANA SOUZA', 'Liliana de Lima Neves')).toBe(false);
    expect(citaCpf('Pix - FULANA - ***.712.440-** - BCO', '52971244091')).toBe(true);
    expect(citaCpf('TED 529.712.440-91', '52971244091')).toBe(true);
    expect(citaCpf('Pix - ***.111.222-**', '52971244091')).toBe(false);
    expect(contaDeRetirada('Distribuição de lucros')).toBe(true); expect(contaDeRetirada('Retirada de dinheiro pelo sócio')).toBe(true);
    expect(contaDeRetirada('Dinheiro colocado pelo sócio')).toBe(false); expect(contaDeRetirada('Pró-labore')).toBe(false); expect(contaDeRetirada('Empréstimo concedido ao sócio')).toBe(false);
  });
});

describe('comparação informado × extrato', () => {
  it('confere, acha esquecida, não encontrada, valor diferente, dinheiro com saque e respeita "não é retirada"', async () => {
    await ret('2026-10-03', 'Liliana de Lima Neves', '1.000,00', nubank);   // confere (Pix 1 dia depois)
    await ret('2026-10-10', 'Liliana de Lima Neves', '2.000,00', nubank);   // valor diferente (2.200)
    await ret('2026-10-15', 'Liliana de Lima Neves', '500,00', 'dinheiro'); // confere com saque
    await ret('2026-10-20', 'Liliana de Lima Neves', '300,00', 'dinheiro'); // só dinheiro, sem saque
    await ret('2026-10-25', 'Liliana de Lima Neves', '750,00', nubank);     // não está no extrato
    await enviarRetiradas(ua, empA, C, false);
    expect((await compararRetiradas(admin, empA, C)).status).toBe('aguardando_extrato');
    await extrato(nubank, [
      '04/10/2026;Transferência enviada pelo Pix - LILIANA LIMA NEVES - •••.712.440-•• - NUBANK;-1000,00',
      '11/10/2026;PIX ENVIADO LILIANA L NEVES ***.712.440-**;-2200,00',
      '15/10/2026;SAQUE BANCO 24H;-500,00',
      '18/10/2026;Pix enviado ***.712.440-** ;-3.500,00',   // esquecida (CPF mascarado)
      '19/10/2026;PAGAMENTO FORNECEDOR XYZ;-3.500,00',      // não é do sócio
      '28/10/2026;TARIFA;-12,00',
    ]);
    const c = await compararRetiradas(admin, empA, C);
    expect(c.status).toBe('atencao');
    expect(c.conferidas.map((x) => [x.informada.valor, x.extrato.valor, x.dias])).toEqual([['1000.00', 100000, 1], ['500.00', 50000, 0]]);
    expect(c.divergentes.map((x) => [x.informada.valor, x.extrato.valor, x.diferenca])).toEqual([['2000.00', 220000, 20000]]);
    expect(c.esquecidas.map((m) => [m.data, m.valor, m.porCpf])).toEqual([['2026-10-18', 350000, true]]);
    expect(c.naoEncontradas.map((i) => i.valor)).toEqual(['750.00']);
    expect(c.emDinheiro.map((i) => i.valor)).toEqual(['300.00']);
    expect(c.resumo).toMatchObject({ informadas: 5, conferidas: 2, esquecidas: 1, totalEsquecido: 350000, naoEncontradas: 1, divergentes: 1, emDinheiro: 1 });

    await expect(marcarNaoRetirada(ua, c.esquecidas[0].id)).rejects.toMatchObject({ code: 'proibido' });
    await marcarNaoRetirada(admin, c.esquecidas[0].id, 'empréstimo ao sócio, devolvido');
    const c2 = await compararRetiradas(admin, empA, C);
    expect(c2.esquecidas).toHaveLength(0); expect(c2.ignoradas.map((m) => m.motivo_ignorada)).toEqual(['empréstimo ao sócio, devolvido']);
    await desfazerNaoRetirada(admin, c.esquecidas[0].id);
    expect((await compararRetiradas(admin, empA, C)).esquecidas).toHaveLength(1);
  });
  it('lançamento classificado como distribuição de lucros sem nome também aparece; conta errada ainda confere e avisa', async () => {
    await ret('2026-10-05', 'Liliana de Lima Neves', '800,00', sicredi);
    await extrato(nubank, ['05/10/2026;PIX ENVIADO LILIANA NEVES;-800,00', '12/10/2026;TED 0001 CONTA PROPRIA;-4.000,00']);
    const ls = await K.listarConciliacao(admin, empA, C);
    await K.classificarEmLote(admin, [ls.find((l) => l.valor === -400000)!.id], 90);
    const c = await compararRetiradas(admin, empA, C);
    expect(c.conferidas).toHaveLength(1); expect(c.conferidas[0].contaDiferente).toBe(true);
    expect(c.esquecidas.map((m) => [m.valor, m.porCategoria])).toEqual([[400000, true]]);
  });
  it('alerta acima de R$ 50 mil no mês por sócio; tudo certo vira ok; visão geral ordena pelas que pedem atenção', async () => {
    await ret('2026-10-05', 'Liliana de Lima Neves', '30.000,00', nubank);
    await extrato(nubank, ['05/10/2026;PIX LILIANA NEVES;-30.000,00']);
    let c = await compararRetiradas(admin, empA, C);
    expect(c.status).toBe('ok'); expect(c.acimaDoLimite).toHaveLength(0);
    await extrato(nubank, ['06/10/2026;PIX ***.712.440-**;-25.000,00']);
    c = await compararRetiradas(admin, empA, C);
    expect(c.acimaDoLimite).toEqual([{ socio: 'Liliana de Lima Neves', total: 5_500_000 }]);
    const v = await visaoLucros(admin, C);
    expect(v.map((x) => [x.empresa.id, x.status])).toEqual([[empA, 'atencao'], [empB, 'sem_movimento']]);
    await expect(visaoLucros(ua, C)).rejects.toMatchObject({ code: 'proibido' });
  });
  it('cliente informa de onde saiu: conta de outra empresa é recusada; origem aparece na lista', async () => {
    const contaB = await X.criarConta(admin, empB, { banco: 'Itaú' });
    await expect(ret('2026-10-05', 'Liliana', '10,00', contaB)).rejects.toThrow(/Conta bancária não encontrada/);
    await expect(lancarRetirada(ua, empA, C, { data: '2026-10-05', socio: 'Liliana', tipo: 'lucros', valor: '10,00', origem: '' })).rejects.toThrow(/de onde saiu/);
    await ret('2026-10-05', 'Liliana', '10,00', nubank); await ret('2026-10-06', 'Liliana', '20,00', 'dinheiro');
    expect((await listarRetiradas(ua, empA, C)).itens.map((i) => [i.forma, i.origem])).toEqual([['banco', 'Nubank'], ['dinheiro', 'Dinheiro']]);
  });
});
