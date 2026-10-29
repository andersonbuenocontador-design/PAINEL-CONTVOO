import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import { aplicarModelo, aplicaNaCompetencia, baixarArquivo, conferirArquivo, criarExigencia, criarModeloDeEmpresa, definirExigenciaAtiva, enviarArquivo, historicoVersoes, situacaoCompetencia, visaoGeral } from '../src/lib/services/documentos';
import type { Actor } from '../src/lib/errors';

const PDF = Buffer.from('%PDF-1.4 teste');
let admin: Actor, ua: Actor, ub: Actor, empA: string, empB: string, exA: string;
const C = '2026-10';

beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, arquivos, exigencias, modelo_itens, modelos_documento, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  ua = { id: await criarUsuario(admin, { nome: 'Cliente A', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
  ub = { id: await criarUsuario(admin, { nome: 'Cliente B', email: 'b@b.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empB] }), papel: 'cliente' };
  exA = await criarExigencia(admin, empA, { nome: 'Extrato conta corrente', instituicao: 'Banrisul', formatos: ['pdf', 'ofx'] });
});

describe('exigências e competência', () => {
  it('começa pendente e não herda de outra competência', async () => {
    await enviarArquivo(ua, { empresaId: empA, exigenciaId: exA, competencia: '2026-09', nome: 'set.pdf', dados: PDF });
    const s = await situacaoCompetencia(ua, empA, C);
    expect(s.itens[0].situacao).toBe('pendente');
    expect(s.indicadores).toMatchObject({ exigidos: 1, pendentes: 1, percentual: 0, concluida: false });
  });
  it('frequência define em quais meses cobra', () => {
    expect(aplicaNaCompetencia('mensal', '2026-10')).toBe(true);
    expect(aplicaNaCompetencia('trimestral', '2026-10')).toBe(false);
    expect(aplicaNaCompetencia('trimestral', '2026-12')).toBe(true);
    expect(aplicaNaCompetencia('anual', '2026-12')).toBe(true);
    expect(aplicaNaCompetencia('eventual', '2026-12')).toBe(false);
  });
  it('duplicado e cliente não configura', async () => {
    await expect(criarExigencia(admin, empA, { nome: 'extrato conta corrente', instituicao: 'banrisul', formatos: ['pdf'] })).rejects.toMatchObject({ code: 'conflito' });
    await expect(criarExigencia(ua, empA, { nome: 'Outro', formatos: ['pdf'] })).rejects.toMatchObject({ code: 'proibido' });
  });
});

describe('envio e versões', () => {
  it('valida formato, conteúdo e tamanho', async () => {
    const base = { empresaId: empA, exigenciaId: exA, competencia: C };
    await expect(enviarArquivo(ua, { ...base, nome: 'x.exe', dados: PDF })).rejects.toThrow(/Formato não aceito/);
    await expect(enviarArquivo(ua, { ...base, nome: 'x.pdf', dados: Buffer.from('MZ binario') })).rejects.toThrow(/não corresponde/);
    await expect(enviarArquivo(ua, { ...base, nome: 'x.pdf', dados: Buffer.alloc(0) })).rejects.toThrow(/vazio/);
    await expect(enviarArquivo(ua, { ...base, competencia: '2026-13', nome: 'x.pdf', dados: PDF })).rejects.toThrow();
  });
  it('reenvio cria nova versão e marca a anterior como substituída', async () => {
    const p = { empresaId: empA, exigenciaId: exA, competencia: C, nome: 'a.pdf', dados: PDF };
    await enviarArquivo(ua, p); await enviarArquivo(ua, { ...p, nome: 'b.pdf' });
    const h = await historicoVersoes(ua, empA, exA, C);
    expect(h.map((x) => [x.versao, x.situacao])).toEqual([[2, 'enviado'], [1, 'substituido']]);
  });
  it('versões concorrentes não colidem', async () => {
    const p = { empresaId: empA, exigenciaId: exA, competencia: C, nome: 'a.pdf', dados: PDF };
    await Promise.all([enviarArquivo(ua, p), enviarArquivo(ua, p), enviarArquivo(ua, p)]);
    expect((await historicoVersoes(admin, empA, exA, C)).map((x) => x.versao)).toEqual([3, 2, 1]);
  });
  it('cliente de outra empresa não envia, lista nem baixa', async () => {
    const p = { empresaId: empA, exigenciaId: exA, competencia: C, nome: 'a.pdf', dados: PDF };
    await expect(enviarArquivo(ub, p)).rejects.toMatchObject({ code: 'nao_encontrado' });
    const id = await enviarArquivo(ua, p);
    await expect(baixarArquivo(ub, id)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(situacaoCompetencia(ub, empA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(historicoVersoes(ub, empA, exA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
    expect((await baixarArquivo(ua, id)).dados.equals(PDF)).toBe(true);
    expect((await baixarArquivo(admin, id)).nome).toBe('a.pdf');
  });
  it('exigência de outra empresa não aceita upload (IDOR)', async () => {
    const exB = await criarExigencia(admin, empB, { nome: 'Extrato', formatos: ['pdf'] });
    await expect(enviarArquivo(ua, { empresaId: empA, exigenciaId: exB, competencia: C, nome: 'a.pdf', dados: PDF })).rejects.toMatchObject({ code: 'nao_encontrado' });
  });
});

describe('conferência', () => {
  it('rejeição exige motivo, cliente vê o motivo e reenvia; aprovado trava cliente', async () => {
    const p = { empresaId: empA, exigenciaId: exA, competencia: C, nome: 'a.pdf', dados: PDF };
    const id1 = await enviarArquivo(ua, p);
    await expect(conferirArquivo(ua, id1, 'aprovado')).rejects.toMatchObject({ code: 'proibido' });
    await expect(conferirArquivo(admin, id1, 'rejeitado', '  ')).rejects.toThrow(/motivo/);
    await conferirArquivo(admin, id1, 'rejeitado', 'Extrato de setembro');
    let s = await situacaoCompetencia(ua, empA, C);
    expect(s.itens[0]).toMatchObject({ situacao: 'rejeitado', motivo_rejeicao: 'Extrato de setembro' });
    expect(s.indicadores.rejeitados).toBe(1);
    const id2 = await enviarArquivo(ua, p);
    await expect(conferirArquivo(admin, id1, 'aprovado')).rejects.toThrow(/mais recente/);
    await conferirArquivo(admin, id2, 'aprovado');
    s = await situacaoCompetencia(ua, empA, C);
    expect(s.indicadores).toMatchObject({ aprovados: 1, percentual: 100, concluida: true });
    await expect(enviarArquivo(ua, p)).rejects.toThrow(/já foi aprovado/);
    await expect(enviarArquivo(admin, p)).resolves.toBeTruthy();
  });
  it('opcional pendente não impede conclusão; obrigatório pendente impede', async () => {
    await criarExigencia(admin, empA, { nome: 'Relatório de vendas', formatos: ['pdf'], obrigatorio: false });
    const id = await enviarArquivo(ua, { empresaId: empA, exigenciaId: exA, competencia: C, nome: 'a.pdf', dados: PDF });
    expect((await situacaoCompetencia(ua, empA, C)).indicadores.concluida).toBe(false);
    await conferirArquivo(admin, id, 'aprovado');
    expect((await situacaoCompetencia(ua, empA, C)).indicadores.concluida).toBe(true);
  });
  it('exigência desativada some da lista mas o histórico permanece', async () => {
    const id = await enviarArquivo(ua, { empresaId: empA, exigenciaId: exA, competencia: C, nome: 'a.pdf', dados: PDF });
    await definirExigenciaAtiva(admin, exA, false);
    expect((await situacaoCompetencia(ua, empA, C)).itens).toHaveLength(0);
    expect((await baixarArquivo(ua, id)).nome).toBe('a.pdf');
  });
});

describe('modelos', () => {
  it('aplica sem sobrescrever o que já existe e informa', async () => {
    await criarExigencia(admin, empA, { nome: 'Informe Nubank', instituicao: 'Nubank', formatos: ['pdf'], frequencia: 'anual' });
    const m = await criarModeloDeEmpresa(admin, 'Banrisul + Nubank', empA);
    await criarExigencia(admin, empB, { nome: 'Extrato conta corrente', instituicao: 'Banrisul', formatos: ['csv'] });
    const r = await aplicarModelo(admin, m, [empB]);
    expect(r).toEqual({ criados: 1, ignorados: 1 });
    const { rows } = await query(`SELECT formatos FROM exigencias WHERE empresa_id=$1 AND nome='Extrato conta corrente'`, [empB]);
    expect(rows[0].formatos).toEqual(['csv']); // personalização preservada
    await expect(aplicarModelo(ua, m, [empB])).rejects.toMatchObject({ code: 'proibido' });
  });
  it('visão geral por competência', async () => {
    const v = await visaoGeral(admin, C);
    expect(v.find((e) => e.id === empA)).toMatchObject({ exigidos: 1, pendentes: 1 });
    expect(v.find((e) => e.id === empB)).toMatchObject({ exigidos: 0, concluida: false });
    await expect(visaoGeral(ua, C)).rejects.toMatchObject({ code: 'proibido' });
  });
});
afterAll(async () => { await getPool().end(); });
