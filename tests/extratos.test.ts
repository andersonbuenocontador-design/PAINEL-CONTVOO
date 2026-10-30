import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import * as X from '../src/lib/services/extratos';
import * as K from '../src/lib/services/conciliacao';
import type { Actor } from '../src/lib/errors';

const C = '2026-10';
const fx = (n: string) => readFileSync('tests/fixtures/extratos/' + n);
const csv = (linhas: string[]) => Buffer.from('Data;Histórico;Valor\n' + linhas.join('\n') + '\n');
const PLANO = `
Referencial
   11   1.1.1.01.0001   BANCO BANRISUL C/C 12345-6      01/01/2020
   21   3.2.1.01.0001   TARIFAS BANCARIAS
   22   3.2.1.02.0003   DESPESA COM INTERNET E TELEFONE
   23   3.2.1.03.0001   ENERGIA ELETRICA
   31   3.1.1.01.0001   RECEITA DE VENDAS
   41   2.1.3.01.0001   FORNECEDORES DIVERSOS
`;
let admin: Actor, ua: Actor, ub: Actor, empA: string, empB: string, contaA: string, contaB: string;

async function importar(a: Actor, emp: string, conta: string, nome: string, dados: Buffer, extras: number[] = []) {
  const id = await X.criarPrevia(a, { empresaId: emp, contaId: conta, competencia: C, nome, dados });
  return { id, r: await X.confirmarImportacao(a, id, extras) };
}
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, arquivos, exigencias, modelo_itens, modelos_documento, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  ua = { id: await criarUsuario(admin, { nome: 'Cliente A', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
  ub = { id: await criarUsuario(admin, { nome: 'Cliente B', email: 'b@b.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empB] }), papel: 'cliente' };
  contaA = await X.criarConta(admin, empA, { banco: 'Banrisul', conta: '123-4' });
  contaB = await X.criarConta(admin, empB, { banco: 'Sicredi' });
  await K.importarPlano(admin, empA, PLANO);
});

describe('importação com prévia', () => {
  it('prévia não grava movimentações; confirmar grava; descrição original preservada', async () => {
    const id = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.ofx', dados: fx('exemplo_ofx_nao_oficial.ofx') });
    expect((await query('SELECT count(*)::int n FROM movimentacoes')).rows[0].n).toBe(0);
    const p = await X.obterPrevia(ua, id);
    expect(p.resumo).toMatchObject({ registros: 2, entradas: 150000, saidas: -45000, aImportar: 2, duplicadasCertas: 0 });
    expect(await X.confirmarImportacao(ua, id)).toEqual({ gravadas: 2, ignoradas: 0 });
    const m = await K.listarConciliacao(ua, empA, C);
    expect(m.map((x) => [x.descricao_original, x.valor])).toEqual([['PIX RECEBIDO - CLIENTE EXEMPLO', 150000], ['PAGAMENTO - FORNECEDOR EXEMPLO', -45000]]);
    await expect(X.confirmarImportacao(ua, id)).rejects.toThrow(/já foi concluída/);
  });
  it('cancelar não grava nada', async () => {
    const id = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.ofx', dados: fx('exemplo_ofx_nao_oficial.ofx') });
    await X.cancelarImportacao(ua, id);
    await expect(X.confirmarImportacao(ua, id)).rejects.toThrow();
    expect((await K.listarConciliacao(ua, empA, C)).length).toBe(0);
  });
  it('reimportar o mesmo OFX (com FITID) não duplica', async () => {
    await importar(ua, empA, contaA, 'a.ofx', fx('exemplo_ofx_nao_oficial.ofx'));
    const id = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.ofx', dados: fx('exemplo_ofx_nao_oficial.ofx') });
    expect((await X.obterPrevia(ua, id)).resumo).toMatchObject({ duplicadasCertas: 2, aImportar: 0, arquivoRepetido: true });
    expect(await X.confirmarImportacao(ua, id)).toEqual({ gravadas: 0, ignoradas: 2 });
    expect((await K.listarConciliacao(ua, empA, C)).length).toBe(2);
  });
  it('CSV sem ID: repetidos no mesmo arquivo são legítimos; reimportação é "possível duplicada" e só entra se o usuário marcar', async () => {
    const arq = csv(['01/10/2026;TARIFA;-10,00', '01/10/2026;TARIFA;-10,00']);
    expect((await importar(ua, empA, contaA, 'a.csv', arq)).r.gravadas).toBe(2);
    const id = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.csv', dados: arq });
    const p = await X.obterPrevia(ua, id);
    expect(p.resumo).toMatchObject({ duplicadasPossiveis: 2, aImportar: 0 });
    expect(await X.confirmarImportacao(ua, id, [0])).toEqual({ gravadas: 1, ignoradas: 1 });
  });
  it('linhas de outra competência ficam de fora; linhas ruins aparecem como incompletas', async () => {
    const arq = csv(['01/10/2026;OK;10,00', '01/09/2026;SETEMBRO;20,00', '99/99/2026;RUIM;1,00']);
    const id = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.csv', dados: arq });
    expect((await X.obterPrevia(ua, id)).resumo).toMatchObject({ registros: 2, foraPeriodo: 1, incompletos: 1, aImportar: 1 });
    expect(await X.confirmarImportacao(ua, id)).toEqual({ gravadas: 1, ignoradas: 1 });
  });
  it('PDF e lixo dão mensagem clara', async () => {
    await expect(X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.pdf', dados: Buffer.from('%PDF-1') })).rejects.toThrow(/PDF/);
    await expect(X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.csv', dados: Buffer.from('nada;aqui\n') })).rejects.toThrow(/colunas/);
  });
});

describe('PDF na importação', () => {
  it('prévia traz a conferência de saldo e a importação grava os lançamentos do PDF', async () => {
    const pdf = readFileSync('tests/fixtures/extratos-pdf/banrisul_ficticio.pdf');
    const id = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'extrato.pdf', dados: pdf });
    const p = await X.obterPrevia(ua, id);
    expect(p.resumo).toMatchObject({ registros: 4, entradas: 210000, saidas: -48990, aImportar: 4, conferenciaSaldo: { confere: true, saldoCalculado: 361010 } });
    expect(await X.confirmarImportacao(ua, id)).toEqual({ gravadas: 4, ignoradas: 0 });
    // reenviar o mesmo PDF: sem ID de transação, vira "possível duplicada" (não entra sozinha)
    const id2 = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'extrato.pdf', dados: pdf });
    expect((await X.obterPrevia(ua, id2)).resumo).toMatchObject({ duplicadasPossiveis: 4, aImportar: 0, arquivoRepetido: true });
  });
});

describe('isolamento', () => {
  it('cliente B não importa na conta de A, não vê prévia, linhas, plano nem classifica', async () => {
    const { id } = await importar(ua, empA, contaA, 'a.ofx', fx('exemplo_ofx_nao_oficial.ofx'));
    await expect(X.criarPrevia(ub, { empresaId: empA, contaId: contaA, competencia: C, nome: 'a.ofx', dados: fx('exemplo_ofx_nao_oficial.ofx') })).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(X.criarPrevia(ub, { empresaId: empB, contaId: contaA, competencia: C, nome: 'a.ofx', dados: fx('exemplo_ofx_nao_oficial.ofx') })).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(X.obterPrevia(ub, id)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.listarConciliacao(ub, empA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.listarPlano(ub, empA)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(X.listarContas(ub, empA)).rejects.toMatchObject({ code: 'nao_encontrado' });
    const m = (await K.listarConciliacao(ua, empA, C))[0];
    await expect(K.classificarEmLote(ub, [m.id], 21)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.confirmarLinhas(ub, [m.id])).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.editarLinha(ub, m.id, { observacao: 'x' })).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.classificarEmLote(ub, [999999], 21)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.enviarParaConferencia(ub, empA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
  });
  it('misturar linhas de duas empresas num lote é barrado', async () => {
    await importar(ua, empA, contaA, 'a.ofx', fx('exemplo_ofx_nao_oficial.ofx'));
    await importar(ub, empB, contaB, 'b.ofx', fx('exemplo_ofx_nao_oficial.ofx'));
    const a = (await K.listarConciliacao(ua, empA, C))[0].id, b = (await K.listarConciliacao(ub, empB, C))[0].id;
    await expect(K.classificarEmLote(ua, [a, b], 21)).rejects.toMatchObject({ code: 'nao_encontrado' });
  });
  it('cliente não cadastra conta bancária nem edita o plano', async () => {
    await expect(X.criarConta(ua, empA, { banco: 'X' })).rejects.toMatchObject({ code: 'proibido' });
    await expect(K.salvarContaPlano(ua, empA, { codigo: 99, classificacao: '3.1.1.01.0009', nome: 'Teste' })).rejects.toMatchObject({ code: 'proibido' });
    await expect(K.importarPlano(ua, empA, PLANO)).rejects.toMatchObject({ code: 'proibido' });
  });
  it('mesmo FITID em contas diferentes não conflita', async () => {
    await importar(ua, empA, contaA, 'a.ofx', fx('exemplo_ofx_nao_oficial.ofx'));
    expect((await importar(ub, empB, contaB, 'a.ofx', fx('exemplo_ofx_nao_oficial.ofx'))).r.gravadas).toBe(2);
  });
});

describe('plano de contas por cliente', () => {
  it('importa do relatório do Domínio, reimporta sem duplicar e cada cliente só tem o seu', async () => {
    const r = await K.importarPlano(admin, empA, PLANO);
    expect(r).toEqual({ lidas: 6, novas: 0, atualizadas: 6 });
    expect((await K.listarPlano(ua, empA)).map((c) => c.codigo).sort((a, b) => a - b)).toEqual([11, 21, 22, 23, 31, 41]);
    expect(await K.listarPlano(ub, empB)).toEqual([]);
    await expect(K.importarPlano(admin, empB, 'texto sem contas')).rejects.toThrow(/Não encontrei contas/);
  });
  it('admin cria, edita e desativa conta; desativada não classifica', async () => {
    await K.salvarContaPlano(admin, empA, { codigo: 50, classificacao: '3.2.9.01.0001', nome: 'Despesas diversas' });
    await K.salvarContaPlano(admin, empA, { codigo: 50, classificacao: '3.2.9.01.0001', nome: 'Despesas gerais' });
    const c50 = (await K.listarPlano(admin, empA)).find((c) => c.codigo === 50)!;
    expect(c50.nome).toBe('Despesas gerais');
    await expect(K.salvarContaPlano(admin, empA, { codigo: 51, classificacao: 'abc', nome: 'Ruim' })).rejects.toThrow(/Classificação inválida/);
    await importar(ua, empA, contaA, 'a.ofx', fx('exemplo_ofx_nao_oficial.ofx'));
    const m = (await K.listarConciliacao(ua, empA, C))[0];
    await K.definirContaPlanoAtiva(admin, c50.id, false);
    await expect(K.classificarEmLote(ua, [m.id], 50)).rejects.toThrow(/não existe no plano/);
  });
});

describe('classificação automática (motor do Conciliador) e revisão', () => {
  const arq = Buffer.from('Data;Histórico;Valor\n02/10/2026;TARIFA MENSAL;-39,90\n03/10/2026;PAGTO ENERGIA ELETRICA;-300,00\n04/10/2026;PIX CLIENTE ZZ;150,00\n');
  it('classifica ao importar com confiança Alta/Média/Baixa e motivo; resumo conta o que falta revisar', async () => {
    await importar(ua, empA, contaA, 'a.csv', arq);
    const ls = await K.listarConciliacao(ua, empA, C);
    const tar = ls.find((l) => /TARIFA/.test(l.descricao_original))!, en = ls.find((l) => /ENERGIA/.test(l.descricao_original))!, pix = ls.find((l) => /PIX/.test(l.descricao_original))!;
    expect(tar).toMatchObject({ conta_codigo: 21, confianca: 'A', conta_nome: 'TARIFAS BANCARIAS', revisado: false });
    expect(en).toMatchObject({ conta_codigo: 23, confianca: 'M' }); expect(en.motivo).toMatch(/palavra-chave/);
    expect(pix).toMatchObject({ conta_codigo: null, confianca: 'B' }); expect(pix.motivo).toMatch(/manualmente/);
    expect(K.resumoLinhas(ls)).toEqual({ linhas: 3, alta: 1, media: 1, baixa: 1, naoRev: 2 });
  });
  it('OK confirma e ensina: o mês seguinte já vem em Alta pelo histórico; sem conta não confirma', async () => {
    await importar(ua, empA, contaA, 'a.csv', arq);
    const ls = await K.listarConciliacao(ua, empA, C);
    const en = ls.find((l) => /ENERGIA/.test(l.descricao_original))!, pix = ls.find((l) => /PIX/.test(l.descricao_original))!;
    await expect(K.confirmarLinhas(ua, [pix.id])).rejects.toThrow(/Escolha uma conta/);
    await K.confirmarLinhas(ua, [en.id]);
    await K.classificarEmLote(ua, [pix.id], 31);
    const depois = await K.listarConciliacao(ua, empA, C);
    expect(depois.find((l) => l.id === en.id)).toMatchObject({ confianca: 'A', revisado: true, revisado_por: 'Cliente A' });
    expect(depois.find((l) => l.id === pix.id)).toMatchObject({ conta_codigo: 31, confianca: 'A', origem: 'manual', revisado: true });
    // novembro: mesma descrição (valor/data diferentes)
    const nov = Buffer.from('Data;Histórico;Valor\n03/11/2026;PAGTO ENERGIA ELETRICA;-310,00\n05/11/2026;PIX CLIENTE ZZ;90,00\n');
    const id = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: '2026-11', nome: 'n.csv', dados: nov }); await X.confirmarImportacao(ua, id);
    const ln = await K.listarConciliacao(ua, empA, '2026-11');
    expect(ln.every((l) => l.confianca === 'A' && l.origem === 'historico')).toBe(true);
    expect(ln.map((l) => l.conta_codigo).sort()).toEqual([23, 31]);
    // outra empresa não herda o aprendizado
    await K.importarPlano(admin, empB, PLANO);
    await importar(ub, empB, contaB, 'b.csv', Buffer.from('Data;Histórico;Valor\n03/10/2026;PIX CLIENTE ZZ;90,00\n'));
    expect((await K.listarConciliacao(ub, empB, C))[0]).toMatchObject({ conta_codigo: null, confianca: 'B' });
  });
  it('editar complemento/observação; lote aplica conta a várias linhas; linhas revisadas não mudam ao reclassificar', async () => {
    await importar(ua, empA, contaA, 'a.csv', arq);
    const ls = await K.listarConciliacao(ua, empA, C);
    await K.editarLinha(ua, ls[2].id, { complemento: 'Venda balcão', observacao: 'conferir NF' });
    expect((await K.listarConciliacao(ua, empA, C))[2]).toMatchObject({ complemento: 'Venda balcão', observacao: 'conferir NF', revisado: false });
    expect(await K.classificarEmLote(ua, ls.map((l) => l.id), 22)).toBe(3);
    await K.salvarContaPlano(admin, empA, { codigo: 21, classificacao: '3.2.1.01.0001', nome: 'TARIFAS BANCARIAS' });
    expect(await K.reclassificarNaoRevisadas(admin, empA)).toBe(0);
    expect((await K.listarConciliacao(ua, empA, C)).every((l) => l.conta_codigo === 22 && l.revisado)).toBe(true);
  });
  it('mudar o plano e reclassificar atualiza só o que não foi revisado', async () => {
    await importar(ua, empA, contaA, 'a.csv', arq);
    await K.salvarContaPlano(admin, empA, { codigo: 24, classificacao: '3.2.1.04.0001', nome: 'TARIFAS E TAXAS DO BANCO' });
    expect(await K.reclassificarNaoRevisadas(admin, empA)).toBe(3);
  });
});

describe('fluxo: enviar, conferir, devolver, concluir', () => {
  const arq = Buffer.from('Data;Histórico;Valor\n02/10/2026;TARIFA MENSAL;-39,90\n04/10/2026;PIX CLIENTE ZZ;150,00\n');
  const ids = async () => (await K.listarConciliacao(ua, empA, C)).map((l) => l.id);
  it('envio exige movimentações e todas com conta; depois de enviado o cliente fica bloqueado e o escritório não', async () => {
    await expect(K.enviarParaConferencia(ua, empA, C)).rejects.toThrow(/Não há movimentações/);
    await importar(ua, empA, contaA, 'a.csv', arq);
    await expect(K.enviarParaConferencia(ua, empA, C)).rejects.toThrow(/1 movimentação\(ões\) sem conta/);
    const [tar, pix] = await ids();
    await K.classificarEmLote(ua, [pix], 31);
    await K.enviarParaConferencia(ua, empA, C);
    expect((await K.obterConciliacao(ua, empA, C)).status).toBe('enviada');
    await expect(K.enviarParaConferencia(ua, empA, C)).rejects.toThrow(/já foi enviada/);
    await expect(K.classificarEmLote(ua, [tar], 21)).rejects.toThrow(/aguardando conferência/);
    await expect(K.confirmarLinhas(ua, [tar])).rejects.toThrow(/aguardando conferência/);
    await expect(K.editarLinha(ua, tar, { observacao: 'x' })).rejects.toThrow(/aguardando conferência/);
    await expect(X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'b.csv', dados: arq })).rejects.toThrow(/aguardando conferência/);
    await expect(K.classificarEmLote(admin, [tar], 21)).resolves.toBe(1); // escritório pode
    // outra competência continua livre para o cliente
    const id2 = await X.criarPrevia(ua, { empresaId: empA, contaId: contaA, competencia: '2026-11', nome: 'n.csv', dados: Buffer.from('Data;Histórico;Valor\n03/11/2026;TARIFA;-1,00\n') });
    expect(id2).toBeTruthy();
  });
  it('devolver exige linhas marcadas ou mensagem; cliente corrige, a marca some e só então reenvia', async () => {
    await importar(ua, empA, contaA, 'a.csv', arq);
    const [tar, pix] = await ids(); await K.classificarEmLote(ua, [tar, pix], 21);
    await expect(K.devolverParaCorrecao(admin, empA, C, 'x')).rejects.toThrow(/enviou para conferência/);
    await K.enviarParaConferencia(ua, empA, C);
    await expect(K.devolverParaCorrecao(admin, empA, C, '  ')).rejects.toThrow(/Marque as movimentações/);
    await expect(K.pedirCorrecao(admin, [pix], ' ')).rejects.toThrow(/Informe o que precisa/);
    await expect(K.pedirCorrecao(ua, [pix], 'não pode')).rejects.toMatchObject({ code: 'proibido' });
    await K.pedirCorrecao(admin, [pix], 'Isto é receita, não tarifa');
    await expect(K.concluirConciliacao(admin, empA, C)).rejects.toThrow(/correção pedida/);
    await K.devolverParaCorrecao(admin, empA, C, 'Ajuste a linha do PIX.');
    const c1 = await K.obterConciliacao(ua, empA, C);
    expect(c1).toMatchObject({ status: 'devolvida', mensagem: 'Ajuste a linha do PIX.' });
    const l1 = (await K.listarConciliacao(ua, empA, C)).find((l) => l.id === pix)!;
    expect(l1).toMatchObject({ correcao_pedida: true, correcao_motivo: 'Isto é receita, não tarifa' });
    await expect(K.enviarParaConferencia(ua, empA, C)).rejects.toThrow(/correção pedida/);
    await K.classificarEmLote(ua, [pix], 31);   // cliente corrige
    expect((await K.listarConciliacao(ua, empA, C)).find((l) => l.id === pix)!.correcao_pedida).toBe(false);
    await K.enviarParaConferencia(ua, empA, C);
    expect((await K.obterConciliacao(ua, empA, C)).status).toBe('enviada');
    expect((await K.obterConciliacao(ua, empA, C)).mensagem).toBeNull();
  });
  it('concluir só do enviado; concluída bloqueia o cliente; reabrir libera; cliente não usa ações do escritório', async () => {
    await importar(ua, empA, contaA, 'a.csv', arq);
    const todos = await ids(); await K.classificarEmLote(ua, todos, 21);
    await expect(K.concluirConciliacao(admin, empA, C)).rejects.toThrow(/enviada pelo cliente/);
    await K.enviarParaConferencia(ua, empA, C);
    await expect(K.concluirConciliacao(ua, empA, C)).rejects.toMatchObject({ code: 'proibido' });
    await expect(K.devolverParaCorrecao(ua, empA, C, 'x')).rejects.toMatchObject({ code: 'proibido' });
    await expect(K.reabrirConciliacao(ua, empA, C)).rejects.toMatchObject({ code: 'proibido' });
    await K.concluirConciliacao(admin, empA, C);
    await expect(K.classificarEmLote(ua, todos, 21)).rejects.toThrow(/já foi concluída/);
    await K.reabrirConciliacao(admin, empA, C);
    await expect(K.reabrirConciliacao(admin, empA, C)).rejects.toThrow(/já está aberta/);
    await expect(K.classificarEmLote(ua, todos, 21)).resolves.toBe(2);
    expect((await query(`SELECT count(*)::int n FROM auditoria WHERE acao IN ('conciliacao.enviar','conciliacao.concluir','conciliacao.reabrir')`)).rows[0].n).toBe(3);
  });
  it('cliente de outra empresa não envia nem vê o andamento', async () => {
    await expect(K.enviarParaConferencia(ub, empA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.obterConciliacao(ub, empA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.conferenciaSaldos(ub, empA, C)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(K.listarConciliacoesEscritorio(ub, C)).rejects.toMatchObject({ code: 'proibido' });
  });
});

describe('conferência de saldos e fila do escritório', () => {
  const pdf = readFileSync('tests/fixtures/extratos-pdf/banrisul_ficticio.pdf');
  it('PDF com saldos: confere; falta de lançamento gera divergência com a diferença; OFX sem saldo inicial: sem dados', async () => {
    await importar(ua, empA, contaA, 'extrato.pdf', pdf);
    expect(await K.conferenciaSaldos(ua, empA, C)).toEqual([{ contaId: contaA, banco: 'Banrisul', conta: '123-4', lancamentos: 4, entradas: 210000, saidas: -48990, saldoInicial: 200000, saldoCalculado: 361010, saldoFinalExtrato: 361010, confere: true, diferenca: 0 }]);
    await query(`DELETE FROM movimentacoes WHERE id=(SELECT id FROM movimentacoes WHERE valor_centavos=-3990)`);
    expect((await K.conferenciaSaldos(ua, empA, C))[0]).toMatchObject({ confere: false, diferenca: 3990, lancamentos: 3 });
    await query('TRUNCATE movimentacoes, importacoes CASCADE');
    await importar(ua, empA, contaA, 'a.ofx', fx('exemplo_ofx_nao_oficial.ofx'));
    expect((await K.conferenciaSaldos(ua, empA, C))[0]).toMatchObject({ saldoInicial: null, saldoFinalExtrato: 305000, confere: null, diferenca: null });
  });
  it('fila: enviadas primeiro, com contagens por empresa', async () => {
    await importar(ua, empA, contaA, 'a.csv', Buffer.from('Data;Histórico;Valor\n02/10/2026;TARIFA MENSAL;-39,90\n04/10/2026;PIX CLIENTE ZZ;150,00\n'));
    const [a, b] = (await K.listarConciliacao(ua, empA, C)).map((l) => l.id); await K.classificarEmLote(ua, [a, b], 21); await K.enviarParaConferencia(ua, empA, C);
    await K.pedirCorrecao(admin, [b], 'conferir');
    const fila = await K.listarConciliacoesEscritorio(admin, C);
    expect(fila[0]).toMatchObject({ id: empA, status: 'enviada', linhas: 2, sem_conta: 0, correcoes: 1 });
    expect(fila.find((f) => f.id === empB)).toMatchObject({ status: 'revisao', linhas: 0 });
  });
});

afterAll(async () => { await getPool().end(); });

describe('envio direto para a conciliação (sem prévia)', () => {
  it('grava os lançamentos na hora e reenviar o mesmo extrato não duplica', async () => {
    const dados = csv(['05/10/2026;TARIFA PACOTE;-29,90', '06/10/2026;PIX RECEBIDO CLIENTE;1.500,00']);
    const r = await X.importarDireto(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'out.csv', dados });
    expect(r).toMatchObject({ competencia: C, gravadas: 2, jaExistiam: 0, outroMes: 0 });
    expect(X.resumoImportacao(r)).toMatch(/^2 lançamento\(s\) do Banrisul foram para a conciliação de 10\/2026/);
    expect((await query('SELECT count(*)::int n FROM movimentacoes WHERE empresa_id=$1', [empA])).rows[0].n).toBe(2);
    const r2 = await X.importarDireto(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'out.csv', dados });
    expect(r2).toMatchObject({ gravadas: 0, jaExistiam: 2 }); expect(X.resumoImportacao(r2)).toMatch(/Nenhum lançamento novo.*2 já existiam/);
    expect((await query('SELECT count(*)::int n FROM movimentacoes WHERE empresa_id=$1', [empA])).rows[0].n).toBe(2);
  });
  it('extrato inteiro de outro mês vai para a conciliação daquele mês', async () => {
    const r = await X.importarDireto(ua, { empresaId: empA, contaId: contaA, competencia: C, nome: 'jul.csv', dados: csv(['10/07/2026;TARIFA;-10,00', '11/07/2026;PIX;50,00']) });
    expect(r).toMatchObject({ competencia: '2026-07', gravadas: 2 });
    expect(X.resumoImportacao(r, C)).toContain('o extrato é de 07/2026');
    expect((await query(`SELECT count(*)::int n FROM movimentacoes WHERE empresa_id=$1 AND competencia='2026-07'`, [empA])).rows[0].n).toBe(2);
    expect((await query(`SELECT count(*)::int n FROM importacoes WHERE empresa_id=$1 AND status='cancelada'`, [empA])).rows[0].n).toBe(1);
  });
  it('cliente de outra empresa não importa', async () => {
    await expect(X.importarDireto(ub, { empresaId: empA, contaId: contaA, competencia: C, nome: 'x.csv', dados: csv(['05/10/2026;X;-1,00']) })).rejects.toMatchObject({ code: 'nao_encontrado' });
  });
});

describe('extrato reconhecido em qualquer envio', () => {
  it('PDF/arquivo que não é extrato não gera lançamento nem conta', async () => {
    expect(await X.tentarImportarExtrato(ua, { empresaId: empA, competencia: C, nome: 'nota.pdf', dados: Buffer.from('%PDF-1.4 nota fiscal') })).toBeNull();
    expect(await X.tentarImportarExtrato(ua, { empresaId: empA, competencia: C, nome: 'planilha.csv', dados: csv(['05/10/2026;X;-1,00']) })).toBeNull();
    expect((await query('SELECT count(*)::int n FROM movimentacoes WHERE empresa_id=$1', [empA])).rows[0].n).toBe(0);
    expect((await query('SELECT count(*)::int n FROM contas_bancarias WHERE empresa_id=$1', [empA])).rows[0].n).toBe(1);
  });
  it('extrato OFX de banco é levado para a conciliação, com a conta para abrir filtrado', async () => {
    const r = await X.tentarImportarExtrato(ua, { empresaId: empA, competencia: C, nome: 'a.ofx', dados: fx('exemplo_ofx_nao_oficial.ofx') });
    expect(r?.gravadas).toBeGreaterThan(0); expect(r?.contaId).toBeTruthy();
    expect(X.urlConciliacao('/cliente/x/extratos', r!, { ok: 'ok' })).toBe(`/cliente/x/extratos?competencia=${r!.competencia}&conta=${r!.contaId}&ok=ok#lancamentos`);
  });
});

describe('extrato de banco sem leitor próprio', () => {
  it('PDF lido pelo leitor genérico com saldo fechando é tratado como extrato; PDF sem texto não', async () => {
    const pdf = (n: string) => readFileSync('tests/fixtures/extratos-pdf/' + n);
    expect(await X.pareceExtratoBancario('tabela_generica_ficticia.pdf', pdf('tabela_generica_ficticia.pdf'))).toBe(true);
    expect(await X.pareceExtratoBancario('sem_texto.pdf', pdf('sem_texto.pdf'))).toBe(false);
  });
});
