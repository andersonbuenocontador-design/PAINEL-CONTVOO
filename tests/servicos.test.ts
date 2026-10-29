import { beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { cnpjValido } from '../src/lib/cnpj';
import { criarEmpresa, listarEmpresas, obterEmpresa, definirSituacao } from '../src/lib/services/empresas';
import { autenticar, buscarUsuarioSessao, criarUsuario, definirAtivo, listarUsuarios, trocarSenha } from '../src/lib/services/usuarios';
import { listarAuditoria } from '../src/lib/services/auditoria';
import type { Actor } from '../src/lib/errors';

const CNPJ_A = '11.222.333/0001-81';
const CNPJ_B = '45.723.174/0001-10';
let admin: Actor, ua: Actor, ub: Actor, empA: string, empB: string;

beforeEach(async () => {
  await query('ALTER TABLE auditoria DISABLE TRIGGER auditoria_no_truncate');
  await query('ALTER TABLE auditoria DISABLE TRIGGER auditoria_no_update');
  await query('TRUNCATE dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, arquivos, exigencias, modelo_itens, modelos_documento, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  await query('ALTER TABLE auditoria ENABLE TRIGGER auditoria_no_truncate');
  await query('ALTER TABLE auditoria ENABLE TRIGGER auditoria_no_update');
  const r = await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`);
  admin = { id: r.rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: CNPJ_A });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: CNPJ_B });
  ua = { id: await criarUsuario(admin, { nome: 'Cliente A', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
  ub = { id: await criarUsuario(admin, { nome: 'Cliente B', email: 'b@b.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empB] }), papel: 'cliente' };
});

describe('CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(cnpjValido(CNPJ_A)).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });
});

describe('isolamento entre empresas', () => {
  it('cliente só lista a própria empresa', async () => {
    expect((await listarEmpresas(ua)).map((e) => e.id)).toEqual([empA]);
    expect((await listarEmpresas(ub)).map((e) => e.id)).toEqual([empB]);
    expect(await listarEmpresas(admin)).toHaveLength(2);
  });
  it('cliente não acessa empresa de outro (mesma resposta de "não existe")', async () => {
    await expect(obterEmpresa(ua, empB)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(obterEmpresa(ua, 'nao-e-uuid')).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(obterEmpresa(ua, empA)).resolves.toMatchObject({ id: empA });
  });
  it('busca do cliente não vaza outras empresas', async () => {
    expect(await listarEmpresas(ua, 'Empresa B')).toHaveLength(0);
    expect(await listarEmpresas(ua, '45723174')).toHaveLength(0);
  });
  it('empresa desativada some para o cliente, mas segue existindo', async () => {
    await definirSituacao(admin, empA, 'inativa');
    expect(await listarEmpresas(ua)).toHaveLength(0);
    await expect(obterEmpresa(ua, empA)).rejects.toMatchObject({ code: 'nao_encontrado' });
    expect(await obterEmpresa(admin, empA)).toMatchObject({ situacao: 'inativa' });
  });
});

describe('permissões administrativas', () => {
  it('cliente não executa ações de admin', async () => {
    await expect(criarEmpresa(ua, { razaoSocial: 'X Ltda', cnpj: '19.131.243/0001-97' })).rejects.toMatchObject({ code: 'proibido' });
    await expect(listarUsuarios(ua)).rejects.toMatchObject({ code: 'proibido' });
    await expect(listarAuditoria(ua)).rejects.toMatchObject({ code: 'proibido' });
    await expect(definirSituacao(ua, empA, 'inativa')).rejects.toMatchObject({ code: 'proibido' });
  });
  it('impede CNPJ duplicado e inválido', async () => {
    await expect(criarEmpresa(admin, { razaoSocial: 'Dup Ltda', cnpj: CNPJ_A })).rejects.toMatchObject({ code: 'conflito' });
    await expect(criarEmpresa(admin, { razaoSocial: 'Inv Ltda', cnpj: '12.345.678/0001-00' })).rejects.toThrow();
  });
});

describe('autenticação', () => {
  it('login correto, errado e bloqueio após 5 falhas', async () => {
    await expect(autenticar('a@a.com', 'SenhaTemp#12345')).resolves.toMatchObject({ papel: 'cliente', deve_trocar_senha: true });
    for (let i = 0; i < 5; i++) await expect(autenticar('a@a.com', 'errada')).rejects.toMatchObject({ code: 'auth' });
    await expect(autenticar('a@a.com', 'SenhaTemp#12345')).rejects.toMatchObject({ code: 'auth' });
  });
  it('e-mail inexistente dá a mesma mensagem', async () => {
    await expect(autenticar('nao@existe.com', 'qualquer')).rejects.toThrow('E-mail ou senha inválidos.');
  });
  it('desativar usuário invalida a sessão existente', async () => {
    const s = await autenticar('a@a.com', 'SenhaTemp#12345');
    expect(await buscarUsuarioSessao(s.id, s.token_version)).not.toBeNull();
    await definirAtivo(admin, s.id, false);
    expect(await buscarUsuarioSessao(s.id, s.token_version)).toBeNull();
  });
  it('troca de senha invalida a sessão anterior e exige senha atual', async () => {
    const s = await autenticar('a@a.com', 'SenhaTemp#12345');
    await expect(trocarSenha(s.id, 'errada', 'NovaSenha#2026!')).rejects.toMatchObject({ code: 'auth' });
    await expect(trocarSenha(s.id, 'SenhaTemp#12345', 'curta')).rejects.toThrow();
    const tv = await trocarSenha(s.id, 'SenhaTemp#12345', 'NovaSenha#2026!');
    expect(await buscarUsuarioSessao(s.id, s.token_version)).toBeNull();
    expect(await buscarUsuarioSessao(s.id, tv)).not.toBeNull();
  });
});

describe('auditoria', () => {
  it('registra ações e é imutável', async () => {
    const logs = await listarAuditoria(admin);
    expect(logs.map((l) => l.acao)).toContain('empresa.criar');
    await expect(query('UPDATE auditoria SET acao=$1', ['x'])).rejects.toThrow(/imutável/);
    await expect(query('DELETE FROM auditoria')).rejects.toThrow(/imutável/);
    await expect(query('TRUNCATE auditoria')).rejects.toThrow(/imutável/);
  });
});

import { afterAll } from 'vitest';
afterAll(async () => { await getPool().end(); });
