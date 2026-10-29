import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { ler } from '../src/lib/storage';
import { criarEmpresa } from '../src/lib/services/empresas';
import { autenticar, criarUsuario } from '../src/lib/services/usuarios';
import * as D from '../src/lib/services/documentos';
import * as I from '../src/lib/services/informes';
import * as L from '../src/lib/services/lgpd';
import type { Actor } from '../src/lib/errors';

const PDF = Buffer.from('%PDF-1.4 conteudo sigiloso');
let admin: Actor, admin2: Actor, ua: Actor, ub: Actor, empA: string, empB: string;
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE login_falhas_ip, dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, arquivos, exigencias, modelo_itens, modelos_documento, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  const adm = async (n: string, e: string) => ({ id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ($1,$2,'x','admin') RETURNING id`, [n, e])).rows[0].id as string, papel: 'admin' as const });
  admin = await adm('Admin', 'admin@x.com'); admin2 = await adm('Admin Dois', 'admin2@x.com');
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' }); empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  const mk = async (n: string, e: string, emp: string) => ({ id: await criarUsuario(admin, { nome: n, email: e, papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [emp] }), papel: 'cliente' as const });
  ua = await mk('Cliente A', 'a@a.com', empA); ub = await mk('Cliente B', 'b@b.com', empB);
});

describe('retenção e descarte', () => {
  it('só descarta o vencido, só com confirmação e só o escritório; conteúdo some do disco mas o registro fica', async () => {
    const ex = await D.criarExigencia(admin, empA, { nome: 'Extrato', formatos: ['pdf'] });
    const velho = await D.enviarArquivo(ua, { empresaId: empA, exigenciaId: ex, competencia: '2018-03', nome: 'velho.pdf', dados: PDF });
    const novo = await D.enviarArquivo(ua, { empresaId: empA, exigenciaId: ex, competencia: '2026-09', nome: 'novo.pdf', dados: PDF });
    const socio = await I.criarSocio(admin, empA, { nome: 'Sócio', cpf: '529.982.247-25', restrito: false }); const tipo = (await I.listarTipos(admin))[0].id;
    const infVelho = await I.criarInforme(admin, empA, { socioId: socio, tipoId: tipo, ano: 2015, nome: 'i.pdf', dados: PDF, disponibilizar: true });
    const infNovo = await I.criarInforme(admin, empA, { socioId: socio, tipoId: tipo, ano: 2025, nome: 'i2.pdf', dados: PDF, disponibilizar: true });
    const chaveVelha = (await query('SELECT chave_storage FROM arquivos WHERE id=$1', [velho])).rows[0].chave_storage;
    expect(await L.relatorioRetencao(admin)).toMatchObject({ anos: 5, documentos: { qtd: 1 }, informes: { qtd: 1 }, jaDescartados: 0 });
    await expect(L.relatorioRetencao(ua)).rejects.toMatchObject({ code: 'proibido' }); await expect(L.descartarVencidos(ua, 'DESCARTAR')).rejects.toMatchObject({ code: 'proibido' });
    await expect(L.descartarVencidos(admin, 'sim')).rejects.toThrow(/digite DESCARTAR/);
    expect(await ler(chaveVelha)).toBeTruthy();
    expect(await L.descartarVencidos(admin, 'DESCARTAR')).toEqual({ documentos: 1, informes: 1 });
    await expect(ler(chaveVelha)).rejects.toThrow(); // apagado do disco
    expect((await query('SELECT nome_original,descartado_em FROM arquivos WHERE id=$1', [velho])).rows[0]).toMatchObject({ nome_original: 'velho.pdf' }); // registro permanece
    await expect(D.baixarArquivo(ua, velho)).rejects.toThrow(/política de retenção/); await expect(I.baixarInforme(admin, infVelho)).rejects.toThrow(/política de retenção/);
    expect((await D.baixarArquivo(ua, novo)).dados.equals(PDF)).toBe(true); expect((await I.baixarInforme(admin, infNovo)).dados.equals(PDF)).toBe(true); // o recente segue intacto
    expect(await L.relatorioRetencao(admin)).toMatchObject({ documentos: { qtd: 0 }, informes: { qtd: 0 }, jaDescartados: 2 });
    expect((await query(`SELECT detalhes FROM auditoria WHERE acao='lgpd.descartar_vencidos'`)).rows[0].detalhes).toMatchObject({ documentos: 1, informes: 1 });
  });
});

describe('direitos do titular', () => {
  it('exporta os dados pessoais sem segredos e registra a operação; só o escritório', async () => {
    await query(`UPDATE usuarios SET mfa_segredo='v1.segredo-cifrado', mfa_ativo=true WHERE id=$1`, [ua.id]);
    const ex = await D.criarExigencia(admin, empA, { nome: 'Extrato', formatos: ['pdf'] }); await D.enviarArquivo(ua, { empresaId: empA, exigenciaId: ex, competencia: '2026-10', nome: 'meu.pdf', dados: PDF });
    const d = await L.exportarDadosUsuario(admin, ua.id);
    expect(d.usuario).toMatchObject({ nome: 'Cliente A', email: 'a@a.com' }); expect(d.empresas[0]).toMatchObject({ razao_social: 'Empresa A Ltda' }); expect(d.arquivosEnviados[0]).toMatchObject({ nome_original: 'meu.pdf' });
    const txt = JSON.stringify(d); expect(txt).not.toMatch(/senha_hash|mfa_segredo|segredo-cifrado|codigo_hash|\$2[aby]\$/);
    expect((await query(`SELECT count(*)::int n FROM auditoria WHERE acao='lgpd.exportar_usuario'`)).rows[0].n).toBe(1);
    await expect(L.exportarDadosUsuario(ub, ua.id)).rejects.toMatchObject({ code: 'proibido' }); await expect(L.exportarDadosUsuario(admin, 'xyz')).rejects.toMatchObject({ code: 'nao_encontrado' });
  });
  it('anonimizar: confirma, tira identificação, acesso e vínculos; mantém auditoria; protege o último admin e a própria conta', async () => {
    await expect(L.anonimizarUsuario(admin, ua.id, 'sim')).rejects.toThrow(/digite ANONIMIZAR/); await expect(L.anonimizarUsuario(ua, ub.id, 'ANONIMIZAR')).rejects.toMatchObject({ code: 'proibido' });
    await expect(L.anonimizarUsuario(admin, admin.id, 'ANONIMIZAR')).rejects.toThrow(/própria conta/);
    await autenticar('a@a.com', 'SenhaTemp#12345'); // gera auditoria com o id dele
    await L.anonimizarUsuario(admin, ua.id, 'ANONIMIZAR');
    const u = (await query('SELECT nome,email,ativo,receber_emails FROM usuarios WHERE id=$1', [ua.id])).rows[0];
    expect(u).toMatchObject({ nome: 'Usuário removido', ativo: false, receber_emails: false }); expect(u.email).toMatch(/@anonimizado\.invalid$/);
    expect((await query('SELECT count(*)::int n FROM usuario_empresas WHERE usuario_id=$1', [ua.id])).rows[0].n).toBe(0);
    await expect(autenticar('a@a.com', 'SenhaTemp#12345')).rejects.toThrow(/inválidos/); await expect(autenticar(u.email, 'SenhaTemp#12345')).rejects.toThrow(/inválidos/);
    expect((await query('SELECT count(*)::int n FROM auditoria WHERE usuario_id=$1', [ua.id])).rows[0].n).toBeGreaterThan(0); // trilha preservada
    await L.anonimizarUsuario(admin, admin2.id, 'ANONIMIZAR'); // admin2 pode (admin ainda existe)
    await expect(L.anonimizarUsuario(admin2, admin.id, 'ANONIMIZAR')).rejects.toThrow(/único administrador/); // protege contra ficar sem nenhum administrador ativo
  });
});
afterAll(async () => { await getPool().end(); });
