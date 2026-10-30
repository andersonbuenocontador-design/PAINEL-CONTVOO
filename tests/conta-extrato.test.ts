import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import { contaDoExtrato, criarConta, definirContaAtiva } from '../src/lib/services/extratos';
import type { Actor } from '../src/lib/errors';

let admin: Actor, ua: Actor, empA: string, empB: string;
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE dicionario_classificacao, conciliacoes, movimentacoes, importacoes, contas_bancarias, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  ua = { id: await criarUsuario(admin, { nome: 'Cliente A', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
});
afterAll(() => getPool().end());

describe('conta detectada pelo extrato', () => {
  it('cadastra na 1ª vez e reaproveita depois (mesmo número com ou sem pontuação)', async () => {
    const id = await contaDoExtrato(ua, empA, { banco: 'BANRISUL', agencia: '0065', conta: '06.187954.0-7' });
    expect((await query('SELECT banco,agencia,conta FROM contas_bancarias WHERE id=$1', [id])).rows[0]).toEqual({ banco: 'BANRISUL', agencia: '0065', conta: '06.187954.0-7' });
    expect(await contaDoExtrato(ua, empA, { banco: 'BANRISUL', conta: '0618795407' })).toBe(id);
    expect((await query(`SELECT count(*)::int n FROM auditoria WHERE acao='conta.criar_pelo_extrato'`)).rows[0].n).toBe(1);
  });
  it('usa a conta já cadastrada pelo escritório; mesmo número em outro banco é outra conta', async () => {
    const sic = await criarConta(admin, empA, { banco: 'Sicredi', agencia: '0116', conta: '84386-1' });
    expect(await contaDoExtrato(ua, empA, { banco: 'SICREDI', agencia: '0116', conta: '84386-1' })).toBe(sic);
    expect(await contaDoExtrato(ua, empA, { banco: 'BANRISUL', conta: '84386-1' })).not.toBe(sic);
  });
  it('conta desativada não recebe extrato; sem número usa a única conta ativa', async () => {
    const c = await criarConta(admin, empA, { banco: 'PAGSEGURO', conta: '72879476-9' });
    expect(await contaDoExtrato(ua, empA, { banco: 'BANCO' })).toBe(c); // CSV sem dados da conta + uma única conta ativa
    await definirContaAtiva(admin, c, false);
    await expect(contaDoExtrato(ua, empA, { banco: 'PAGSEGURO', conta: '72879476-9' })).rejects.toThrow(/desativada/);
    await expect(contaDoExtrato(ua, empA, {})).rejects.toThrow(/Não consegui identificar a conta/);
  });
  it('contas de outra empresa não se misturam', async () => {
    const b = await criarConta(admin, empB, { banco: 'BANRISUL', conta: '1234-5' });
    expect(await contaDoExtrato(ua, empA, { banco: 'BANRISUL', conta: '1234-5' })).not.toBe(b);
    await expect(contaDoExtrato(ua, empB, { banco: 'BANRISUL', conta: '9999-9' })).rejects.toMatchObject({ code: 'nao_encontrado' });
    expect((await query('SELECT count(*)::int n FROM contas_bancarias WHERE empresa_id=$1', [empB])).rows[0].n).toBe(1);
  });
});
