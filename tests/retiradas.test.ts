import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import { enviarRetiradas, lancarRetirada, listarRetiradas, reabrirRetiradas, removerRetirada, sugestoesSocios, valorBR } from '../src/lib/services/retiradas';
import type { Actor } from '../src/lib/errors';

let admin: Actor, ua: Actor, ub: Actor, empA: string, empB: string;
const C = '2026-10';
const l = (o: Partial<{ data: string; socio: string; tipo: 'pro_labore' | 'lucros' | 'outras'; valor: string; observacao: string }> = {}) =>
  ({ data: '2026-10-05', socio: 'Maria Souza', tipo: 'pro_labore' as const, valor: '1.500,00', ...o });

beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE retiradas_envios, retiradas, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  ua = { id: await criarUsuario(admin, { nome: 'Cliente A', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
  ub = { id: await criarUsuario(admin, { nome: 'Cliente B', email: 'b@b.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empB] }), papel: 'cliente' };
});
afterAll(() => getPool().end());

describe('retiradas dos sócios (o cliente informa)', () => {
  it('entende valores no formato brasileiro', () => {
    expect(valorBR('1.500,00')).toBe(1500); expect(valorBR('1500,5')).toBe(1500.5); expect(valorBR('R$ 2.000')).toBe(2000);
    expect(valorBR('1500.25')).toBe(1500.25); expect(valorBR('12.345.678,90')).toBe(12345678.9);
    for (const x of ['', 'abc', '1,2,3', '-50', '1.50.0']) expect(valorBR(x)).toBeNaN();
  });
  it('cliente lança, vê totais por sócio e tipo; nomes viram sugestão', async () => {
    await lancarRetirada(ua, empA, C, l());
    await lancarRetirada(ua, empA, C, l({ tipo: 'lucros', valor: '10.000,00', data: '2026-10-20' }));
    await lancarRetirada(ua, empA, C, l({ socio: 'João Lima', tipo: 'outras', valor: '250,50', observacao: 'PIX' }));
    const r = await listarRetiradas(admin, empA, C);
    expect(r.itens).toHaveLength(3); expect(r.total).toBe(11750.5); expect(r.envio).toBeUndefined();
    expect(r.totais.find((t) => t.socio === 'Maria Souza')).toMatchObject({ pro_labore: 1500, lucros: 10000, outras: 0, total: 11500 });
    expect(await sugestoesSocios(ua, empA)).toEqual(['João Lima', 'Maria Souza']);
    expect((await listarRetiradas(ua, empA, '2026-09')).itens).toHaveLength(0);
  });
  it('valida data no mês, valor, sócio e tipo', async () => {
    await expect(lancarRetirada(ua, empA, C, l({ data: '2026-09-30' }))).rejects.toThrow(/dentro de 10\/2026/);
    await expect(lancarRetirada(ua, empA, C, l({ data: '2026-10-32' }))).rejects.toThrow(/Data inválida/);
    await expect(lancarRetirada(ua, empA, C, l({ valor: '0' }))).rejects.toThrow(/Valor inválido/);
    await expect(lancarRetirada(ua, empA, C, l({ valor: 'mil reais' }))).rejects.toThrow(/Valor inválido/);
    await expect(lancarRetirada(ua, empA, C, l({ socio: ' ' }))).rejects.toThrow(/nome do sócio/);
    await expect(lancarRetirada(ua, empA, C, { ...l(), tipo: 'salario' as 'outras' })).rejects.toThrow(/tipo/);
    expect((await listarRetiradas(ua, empA, C)).itens).toHaveLength(0);
  });
  it('cliente de outra empresa não vê nem mexe', async () => {
    const id = await lancarRetirada(ua, empA, C, l());
    await expect(listarRetiradas(ub, empA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(lancarRetirada(ub, empA, C, l())).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(removerRetirada(ub, id)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(enviarRetiradas(ub, empA, C, false)).rejects.toMatchObject({ code: 'nao_encontrado' });
  });
  it('envio trava o mês para o cliente; escritório devolve para correção', async () => {
    await expect(enviarRetiradas(ua, empA, C, false)).rejects.toThrow(/Nenhuma retirada/);
    const id = await lancarRetirada(ua, empA, C, l());
    await expect(enviarRetiradas(ua, empA, C, true)).rejects.toThrow(/Há retiradas/);
    await enviarRetiradas(ua, empA, C, false);
    expect((await listarRetiradas(admin, empA, C)).envio).toMatchObject({ sem_retiradas: false, enviado_por: 'Cliente A' });
    await expect(lancarRetirada(ua, empA, C, l())).rejects.toThrow(/já foram enviadas/);
    await expect(removerRetirada(ua, id)).rejects.toThrow(/já foram enviadas/);
    await expect(enviarRetiradas(ua, empA, C, false)).rejects.toThrow(/já foi enviado/);
    await expect(reabrirRetiradas(ua, empA, C)).rejects.toMatchObject({ code: 'proibido' });
    await reabrirRetiradas(admin, empA, C);
    await removerRetirada(ua, id);
    await enviarRetiradas(ua, empA, C, true);
    const r = await listarRetiradas(admin, empA, C);
    expect(r.itens).toHaveLength(0); expect(r.envio?.sem_retiradas).toBe(true);
    const acoes = (await query(`SELECT acao FROM auditoria WHERE acao LIKE 'retirada%' ORDER BY id`)).rows.map((x) => x.acao);
    expect(acoes).toEqual(['retirada.lancar', 'retiradas.enviar', 'retiradas.reabrir', 'retirada.remover', 'retiradas.sem_retiradas']);
  });
});
