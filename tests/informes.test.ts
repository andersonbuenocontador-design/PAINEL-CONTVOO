import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import * as I from '../src/lib/services/informes';
import type { Actor } from '../src/lib/errors';

const PDF = Buffer.from('%PDF-1.4 informe'); const PDF2 = Buffer.from('%PDF-1.4 informe corrigido');
const CPF1 = '529.982.247-25', CPF2 = '111.444.777-35';
let admin: Actor, ua1: Actor, ua2: Actor, ub: Actor, empA: string, empB: string, tipo: string;

beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, arquivos, exigencias, modelo_itens, modelos_documento, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  const mk = async (nome: string, email: string, emp: string) => ({ id: await criarUsuario(admin, { nome, email, papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [emp] }), papel: 'cliente' as const });
  ua1 = await mk('Sócio Um', 'u1@a.com', empA); ua2 = await mk('Sócio Dois', 'u2@a.com', empA); ub = await mk('Cliente B', 'b@b.com', empB);
  await query("DELETE FROM informe_tipos WHERE nome='Comprovante de IRPF'");
  tipo = (await I.listarTipos(admin))[0].id;
});
const novoInforme = (emp: string, socioId: string, extra: object = {}) => I.criarInforme(admin, emp, { socioId, tipoId: tipo, ano: 2025, nome: 'informe.pdf', dados: PDF, disponibilizar: true, ...extra });

describe('sócios', () => {
  it('valida CPF, impede duplicado e só o escritório cadastra', async () => {
    await expect(I.criarSocio(admin, empA, { nome: 'X Y', cpf: '123.456.789-00' })).rejects.toThrow(/CPF inválido/);
    const id = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF1 });
    await expect(I.criarSocio(admin, empA, { nome: 'Outro', cpf: CPF1 })).rejects.toMatchObject({ code: 'conflito' });
    await expect(I.criarSocio(ua1, empA, { nome: 'Fraude', cpf: CPF2 })).rejects.toMatchObject({ code: 'proibido' });
    expect((await I.listarSocios(admin, empA))[0]).toMatchObject({ id, cpf: '52998224725', restrito: true });
    expect(I.cpfMascarado('52998224725')).toBe('***.982.***-25');
    await I.criarSocio(admin, empB, { nome: 'Mesmo CPF em outra empresa', cpf: CPF1 }); // permitido: CPF é único por empresa
  });
  it('só autoriza usuário cliente vinculado à mesma empresa', async () => {
    const s = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF1 });
    await expect(I.definirAcessoSocio(admin, s, ub.id, true)).rejects.toThrow(/não é um cliente ativo vinculado/);
    await expect(I.definirAcessoSocio(ua1, s, ua1.id, true)).rejects.toMatchObject({ code: 'proibido' });
    await I.definirAcessoSocio(admin, s, ua1.id, true);
    expect((await I.listarSocios(admin, empA))[0].usuarios.map((u) => u.nome)).toEqual(['Sócio Um']);
  });
});

describe('informes: visibilidade por sócio', () => {
  it('sócio restrito: só o usuário autorizado vê e baixa; o outro da mesma empresa não; admin vê tudo', async () => {
    const s1 = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF1 }); const s2 = await I.criarSocio(admin, empA, { nome: 'Sócio Dois', cpf: CPF2 });
    await I.definirAcessoSocio(admin, s1, ua1.id, true); await I.definirAcessoSocio(admin, s2, ua2.id, true);
    const i1 = await novoInforme(empA, s1), i2 = await novoInforme(empA, s2);
    expect((await I.listarInformesCliente(ua1, empA)).map((x) => x.id)).toEqual([i1]);
    expect((await I.listarInformesCliente(ua2, empA)).map((x) => x.id)).toEqual([i2]);
    expect(await I.listarInformesCliente(admin, empA)).toHaveLength(2);
    expect((await I.baixarInforme(ua1, i1)).dados.equals(PDF)).toBe(true);
    await expect(I.baixarInforme(ua1, i2)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(I.baixarInforme(ua2, i1)).rejects.toMatchObject({ code: 'nao_encontrado' });
    const l = (await I.listarInformesCliente(ua1, empA))[0]; expect(l.cpf_mascarado).toBe('***.982.***-25'); expect(JSON.stringify(l)).not.toContain('52998224725');
  });
  it('sócio sem restrição: qualquer usuário da empresa vê; sócio restrito sem ninguém autorizado: ninguém do cliente vê', async () => {
    const aberto = await I.criarSocio(admin, empA, { nome: 'Aberto', cpf: CPF1, restrito: false }); const fechado = await I.criarSocio(admin, empA, { nome: 'Fechado', cpf: CPF2 });
    const ia = await novoInforme(empA, aberto); await novoInforme(empA, fechado);
    expect((await I.listarInformesCliente(ua1, empA)).map((x) => x.id)).toEqual([ia]);
    expect((await I.listarInformesCliente(ua2, empA)).map((x) => x.id)).toEqual([ia]);
  });
  it('isolamento entre empresas: nem lista, nem baixa, nem histórico', async () => {
    const s = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF1, restrito: false }); const i = await novoInforme(empA, s);
    await expect(I.listarInformesCliente(ub, empA)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(I.baixarInforme(ub, i)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(I.baixarInforme(ub, 'nao-e-uuid')).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(I.historicoInforme(ua1, i)).rejects.toMatchObject({ code: 'proibido' });
    await expect(I.listarInformesAdmin(ua1, empA)).rejects.toMatchObject({ code: 'proibido' });
  });
  it('sócio de outra empresa não pode receber informe (integridade); sócio inativo some para o cliente', async () => {
    const sB = await I.criarSocio(admin, empB, { nome: 'Sócio B', cpf: CPF1 });
    await expect(novoInforme(empA, sB)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(query(`INSERT INTO informes(empresa_id,socio_id,tipo_id,ano_calendario,criado_por) VALUES ($1,$2,$3,2025,$4)`, [empA, sB, tipo, admin.id])).rejects.toThrow(/foreign key/);
    const s = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF2, restrito: false }); await novoInforme(empA, s);
    expect(await I.listarInformesCliente(ua1, empA)).toHaveLength(1);
    await I.definirSocioAtivo(admin, s, false); expect(await I.listarInformesCliente(ua1, empA)).toHaveLength(0);
  });
});

describe('informes: arquivo, versões, situação e acessos', () => {
  it('valida arquivo; rascunho e retirado ficam invisíveis; disponibilizar mostra', async () => {
    const s = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF1, restrito: false });
    await expect(novoInforme(empA, s, { nome: 'x.exe' })).rejects.toThrow(/Formato não aceito/);
    await expect(novoInforme(empA, s, { dados: Buffer.from('MZ') })).rejects.toThrow(/não corresponde/);
    await expect(novoInforme(empA, s, { ano: 1999 })).rejects.toThrow(/Ano inválido/);
    const i = await novoInforme(empA, s, { disponibilizar: false });
    expect(await I.listarInformesCliente(ua1, empA)).toHaveLength(0);
    await expect(I.baixarInforme(ua1, i)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await I.definirSituacaoInforme(admin, i, 'disponivel'); expect((await I.listarInformesCliente(ua1, empA))[0].disponibilizado_em).toBeTruthy();
    await I.definirSituacaoInforme(admin, i, 'retirado'); expect(await I.listarInformesCliente(ua1, empA)).toHaveLength(0);
    await expect(I.definirSituacaoInforme(ua1, i, 'disponivel')).rejects.toMatchObject({ code: 'proibido' });
  });
  it('substituir cria versão nova; cliente baixa a atual; escritório acessa versões antigas; downloads ficam registrados', async () => {
    const s = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF1, restrito: false }); const i = await novoInforme(empA, s);
    expect(await I.substituirArquivoInforme(admin, i, 'corrigido.pdf', PDF2)).toBe(2);
    await expect(I.substituirArquivoInforme(ua1, i, 'x.pdf', PDF2)).rejects.toMatchObject({ code: 'proibido' });
    const atual = await I.baixarInforme(ua1, i); expect(atual.dados.equals(PDF2)).toBe(true); expect(atual.nome).toBe('corrigido.pdf');
    expect((await I.baixarInforme(ua1, i, 1)).dados.equals(PDF2)).toBe(true); // cliente ignora ?v e recebe sempre a atual
    expect((await I.baixarInforme(admin, i, 1)).dados.equals(PDF)).toBe(true);
    const h = await I.historicoInforme(admin, i);
    expect(h.versoes.map((v) => v.versao)).toEqual([2, 1]);
    expect(h.acessos.map((a) => [a.usuario, a.versao])).toEqual([['Admin', 1], ['Sócio Um', 2], ['Sócio Um', 2]]);
    expect((await I.listarInformesAdmin(admin, empA))[0]).toMatchObject({ versao_atual: 2, downloads: 3, arquivo: 'corrigido.pdf' });
    expect((await query(`SELECT count(*)::int n FROM auditoria WHERE acao='informe.baixar'`)).rows[0].n).toBe(3);
  });
  it('versões simultâneas não colidem; tipos configuráveis', async () => {
    const s = await I.criarSocio(admin, empA, { nome: 'Sócio Um', cpf: CPF1, restrito: false }); const i = await novoInforme(empA, s);
    await Promise.all([1, 2, 3].map((k) => I.substituirArquivoInforme(admin, i, `v${k}.pdf`, Buffer.from(`%PDF-${k}`))));
    expect((await I.historicoInforme(admin, i)).versoes.map((v) => v.versao)).toEqual([4, 3, 2, 1]);
    await I.criarTipo(admin, 'Comprovante de IRPF'); await expect(I.criarTipo(admin, 'comprovante de irpf')).rejects.toMatchObject({ code: 'conflito' });
    await expect(I.criarTipo(ua1, 'Fraude')).rejects.toMatchObject({ code: 'proibido' });
    const ano = await I.listarInformesCliente(ua1, empA, 2024); expect(ano).toHaveLength(0);
  });
});
afterAll(async () => { await getPool().end(); });
