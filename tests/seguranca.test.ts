import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { hotp, passoDe, verificarTotp, debase32, base32 } from '../src/lib/totp';
import { cifrar, decifrar } from '../src/lib/cripto';
import { problemaDaSenha } from '../src/lib/senha';
import { gravar, ler } from '../src/lib/storage';
import { criarEmpresa, listarEmpresas } from '../src/lib/services/empresas';
import { autenticar, criarUsuario, trocarSenha } from '../src/lib/services/usuarios';
import { ativarMfa, iniciarMfa, redefinirMfa, segredoPendente, statusMfa, verificarSegundoFator } from '../src/lib/services/seguranca';
import * as D from '../src/lib/services/documentos';
import * as X from '../src/lib/services/extratos';
import * as K from '../src/lib/services/conciliacao';
import * as I from '../src/lib/services/informes';
import * as P from '../src/lib/services/pendencias';
import type { Actor } from '../src/lib/errors';

describe('TOTP (RFC 6238) e criptografia', () => {
  const seg = base32(Buffer.from('12345678901234567890'));
  it('vetores oficiais da RFC 6238 (SHA-1)', () => {
    expect(seg).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(hotp(seg, passoDe(59_000), 8)).toBe('94287082'); expect(hotp(seg, passoDe(1111111109_000), 8)).toBe('07081804'); expect(hotp(seg, passoDe(1234567890_000), 8)).toBe('89005924');
    expect(debase32(seg).toString()).toBe('12345678901234567890');
  });
  it('aceita ±1 passo, recusa fora da janela e lixo', () => {
    const t = 1_700_000_000_000; const c = hotp(seg, passoDe(t));
    expect(verificarTotp(seg, c, t)).toBe(passoDe(t)); expect(verificarTotp(seg, c, t + 30_000)).toBe(passoDe(t)); expect(verificarTotp(seg, c, t + 90_000)).toBeNull();
    expect(verificarTotp(seg, 'abcdef', t)).toBeNull(); expect(verificarTotp(seg, '12345', t)).toBeNull();
  });
  it('cifra e decifra; adulteração é detectada; cada cifragem é diferente', () => {
    const a = cifrar('SEGREDO123'); expect(a).not.toContain('SEGREDO123'); expect(decifrar(a)).toBe('SEGREDO123'); expect(cifrar('SEGREDO123')).not.toBe(a);
    const [v, iv, tag, ct] = a.split('.'); expect(() => decifrar([v, iv, tag, ct.slice(0, -2) + 'AA'].join('.'))).toThrow(); expect(() => decifrar('lixo')).toThrow();
  });
});

describe('política de senha', () => {
  it.each([['curta1', /10 caracteres/], ['1234567890', /comum/], ['Senha12345', /comum/], ['aaaaaaaaaaaa', /repetido/], ['Contvoo2026', /comum|fácil/], ['joaosilva#2026', /e-mail/]])('%s é recusada', (s, re) => {
    expect(problemaDaSenha(s, 'joaosilva@x.com')).toMatch(re);
  });
  it('aceita senhas razoáveis', () => { for (const s of ['SenhaTemp#12345', 'NovaSenha#2026!', 'cavalo-bateria-grampo-9', 'T4rtaruga&Lua!!']) expect(problemaDaSenha(s, 'joao@x.com')).toBeNull(); });
});

let admin: Actor, ua: Actor, ub: Actor, empA: string, empB: string;
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE login_falhas_ip, dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, arquivos, exigencias, modelo_itens, modelos_documento, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' }); empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  const mk = async (nome: string, email: string, emp: string) => ({ id: await criarUsuario(admin, { nome, email, papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [emp] }), papel: 'cliente' as const });
  ua = await mk('Cliente A', 'a@a.com', empA); ub = await mk('Cliente B', 'b@b.com', empB);
});

describe('login: senha, e-mail e limite por IP', () => {
  it('senha fraca é recusada na criação e na troca (inclusive com parte do e-mail)', async () => {
    await expect(criarUsuario(admin, { nome: 'Fulano X', email: 'fulano@x.com', papel: 'cliente', senhaTemporaria: 'Senha12345' })).rejects.toThrow(/comum/);
    await expect(criarUsuario(admin, { nome: 'Fulano X', email: 'fulano@x.com', papel: 'cliente', senhaTemporaria: 'fulano#2026ab' })).rejects.toThrow(/e-mail/);
    await expect(trocarSenha(ua.id, 'SenhaTemp#12345', '1234567890')).rejects.toThrow(/comum/);
  });
  it('30 falhas do mesmo IP bloqueiam esse IP (mesmo com a senha certa); outro IP segue livre; o IP não é guardado em claro', async () => {
    for (let i = 0; i < 30; i++) await expect(autenticar(`nao${i}@existe.com`, 'qualquer-senha', '203.0.113.7')).rejects.toThrow(/inválidos/);
    await expect(autenticar('a@a.com', 'SenhaTemp#12345', '203.0.113.7')).rejects.toThrow(/Muitas tentativas/);
    await expect(autenticar('a@a.com', 'SenhaTemp#12345', '198.51.100.9')).resolves.toMatchObject({ papel: 'cliente', mfa_ativo: false });
    expect(JSON.stringify((await query('SELECT * FROM login_falhas_ip')).rows)).not.toContain('203.0.113.7');
  });
});

describe('verificação em duas etapas', () => {
  const ativar = async (u: Actor) => { const { segredo } = await iniciarMfa(u); const passo = passoDe(Date.now()); return { segredo, codigos: await ativarMfa(u, hotp(segredo, passo)), passo }; };
  it('ativação: segredo cifrado no banco, código errado recusado, 8 códigos de recuperação, login passa a exigir o 2º passo', async () => {
    const { segredo } = await iniciarMfa(ua);
    const bruto = (await query('SELECT mfa_segredo FROM usuarios WHERE id=$1', [ua.id])).rows[0].mfa_segredo as string; expect(bruto.startsWith('v1.')).toBe(true); expect(bruto).not.toContain(segredo);
    expect((await segredoPendente(ua.id))!.segredo).toBe(segredo); expect(await statusMfa(ua.id)).toMatchObject({ ativo: false, pendente: true });
    await expect(ativarMfa(ua, '000000')).rejects.toThrow(/Código incorreto/);
    const codigos = await ativarMfa(ua, hotp(segredo, passoDe(Date.now()))); expect(codigos).toHaveLength(8);
    expect(await statusMfa(ua.id)).toMatchObject({ ativo: true, codigosRestantes: 8 });
    expect(JSON.stringify((await query('SELECT codigo_hash FROM mfa_recuperacao')).rows)).not.toContain(codigos[0].replace('-', ''));
    await expect(autenticar('a@a.com', 'SenhaTemp#12345')).resolves.toMatchObject({ mfa_ativo: true });
    await expect(iniciarMfa(ua)).rejects.toThrow(/já está ativa/);
  });
  it('2º passo: código válido entra uma vez (replay recusado); código errado conta para o bloqueio; usuário sem 2FA não passa', async () => {
    const { segredo, passo } = await ativar(ua);
    await expect(verificarSegundoFator(ua.id, hotp(segredo, passo))).rejects.toThrow(/inválido/); // mesmo passo usado na ativação = replay
    const prox = hotp(segredo, passo + 1);
    await expect(verificarSegundoFator(ua.id, prox)).resolves.toMatchObject({ id: ua.id, mfa_ativo: true });
    await expect(verificarSegundoFator(ua.id, prox)).rejects.toThrow(/inválido/);
    await expect(verificarSegundoFator(ub.id, '123456')).rejects.toThrow(/inválido/);
    for (let i = 0; i < 5; i++) await expect(verificarSegundoFator(ua.id, '111111')).rejects.toThrow();
    await expect(verificarSegundoFator(ua.id, hotp(segredo, passo - 1))).rejects.toThrow(/bloqueado/);
    expect((await query(`SELECT count(*)::int n FROM auditoria WHERE acao='mfa.falha'`)).rows[0].n).toBeGreaterThanOrEqual(5);
  });
  it('código de recuperação vale uma vez só', async () => {
    const { codigos } = await ativar(ua);
    await expect(verificarSegundoFator(ua.id, codigos[0])).resolves.toMatchObject({ id: ua.id });
    await expect(verificarSegundoFator(ua.id, codigos[0])).rejects.toThrow(/inválido/);
    await expect(verificarSegundoFator(ua.id, codigos[1].toUpperCase())).resolves.toBeTruthy();
    expect((await statusMfa(ua.id)).codigosRestantes).toBe(6);
  });
  it('só o escritório redefine; redefinir derruba sessões e desliga a proteção', async () => {
    await ativar(ua); const tv0 = (await query('SELECT token_version FROM usuarios WHERE id=$1', [ua.id])).rows[0].token_version;
    await expect(redefinirMfa(ub, ua.id)).rejects.toMatchObject({ code: 'proibido' }); await expect(redefinirMfa(ua, ua.id)).rejects.toMatchObject({ code: 'proibido' });
    await redefinirMfa(admin, ua.id);
    expect(await statusMfa(ua.id)).toMatchObject({ ativo: false, pendente: false, codigosRestantes: 0 });
    expect((await query('SELECT token_version FROM usuarios WHERE id=$1', [ua.id])).rows[0].token_version).toBe(tv0 + 1);
    await expect(autenticar('a@a.com', 'SenhaTemp#12345')).resolves.toMatchObject({ mfa_ativo: false });
  });
});

describe('proteções de entrada', () => {
  it('chave de armazenamento com ../ é recusada', async () => {
    await expect(gravar('../fora.txt', Buffer.from('x'))).rejects.toThrow(/chave inválida/); await expect(ler('../../etc/passwd')).rejects.toThrow(/chave inválida/); await expect(ler('/etc/passwd')).rejects.toThrow();
  });
  it('busca com aspas, curingas e SQL não vaza nem quebra', async () => {
    for (const q of [`' OR 'a'='a' --`, `%`, `_`, `\\`, `x'; DROP TABLE empresas; --`]) expect(await listarEmpresas(admin, q)).toEqual([]);
    expect(await listarEmpresas(admin)).toHaveLength(2); expect(await P.listarPendenciasEscritorio(admin, { busca: `%' OR '1'='1` })).toEqual([]);
  });
});

describe('matriz de acesso cruzado: cliente da empresa B contra TODOS os dados da empresa A', () => {
  const PDF = Buffer.from('%PDF-1.4 teste'); const OFX = Buffer.from('Data;Histórico;Valor\n02/10/2026;TARIFA MENSAL;-39,90\n04/10/2026;PIX CLIENTE ZZ;150,00\n');
  it('nenhuma função de leitura ou escrita responde com dados de A para B', async () => {
    const ex = await D.criarExigencia(admin, empA, { nome: 'Extrato', formatos: ['pdf'] }); const arq = await D.enviarArquivo(ua, { empresaId: empA, exigenciaId: ex, competencia: '2026-10', nome: 'a.pdf', dados: PDF });
    const conta = await X.criarConta(admin, empA, { banco: 'Banrisul' }); await K.importarPlano(admin, empA, '   21   3.2.1.01.0001   TARIFAS BANCARIAS');
    const prev = await X.criarPrevia(ua, { empresaId: empA, contaId: conta, competencia: '2026-10', nome: 'e.csv', dados: OFX });
    const prev2 = await X.criarPrevia(ua, { empresaId: empA, contaId: conta, competencia: '2026-10', nome: 'e2.csv', dados: OFX }); await X.confirmarImportacao(ua, prev);
    const [m1] = (await K.listarConciliacao(ua, empA, '2026-10')).map((l) => l.id);
    const socio = await I.criarSocio(admin, empA, { nome: 'Sócio A', cpf: '529.982.247-25', restrito: false }); const tipo = (await I.listarTipos(admin))[0].id;
    const inf = await I.criarInforme(admin, empA, { socioId: socio, tipoId: tipo, ano: 2025, nome: 'i.pdf', dados: PDF, disponibilizar: true });
    const pen = await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Algo para A' });
    const C = '2026-10';
    const tentativas: [string, () => Promise<unknown>][] = [
      ['docs.situacao', () => D.situacaoCompetencia(ub, empA, C)], ['docs.historico', () => D.historicoVersoes(ub, empA, ex, C)], ['docs.baixar', () => D.baixarArquivo(ub, arq)],
      ['docs.enviar', () => D.enviarArquivo(ub, { empresaId: empA, exigenciaId: ex, competencia: C, nome: 'x.pdf', dados: PDF })], ['docs.conferir', () => D.conferirArquivo(ub, arq, 'aprovado')],
      ['docs.criarExigencia', () => D.criarExigencia(ub, empA, { nome: 'Fraude', formatos: ['pdf'] })], ['docs.visaoGeral', () => D.visaoGeral(ub, C)],
      ['ext.contas', () => X.listarContas(ub, empA)], ['ext.previa', () => X.criarPrevia(ub, { empresaId: empA, contaId: conta, competencia: C, nome: 'e.csv', dados: OFX })],
      ['ext.obterPrevia', () => X.obterPrevia(ub, prev2)], ['ext.cancelar', () => X.cancelarImportacao(ub, prev2)], ['ext.confirmar', () => X.confirmarImportacao(ub, prev2)], ['ext.importacoes', () => X.listarImportacoes(ub, empA, C)], ['ext.criarConta', () => X.criarConta(ub, empA, { banco: 'X' })],
      ['conc.plano', () => K.listarPlano(ub, empA)], ['conc.linhas', () => K.listarConciliacao(ub, empA, C)], ['conc.bancos', () => K.bancosConciliacao(ub, empA, C)], ['conc.saldos', () => K.conferenciaSaldos(ub, empA, C)], ['conc.status', () => K.obterConciliacao(ub, empA, C)],
      ['conc.classificar', () => K.classificarEmLote(ub, [m1], 21)], ['conc.confirmar', () => K.confirmarLinhas(ub, [m1])], ['conc.editar', () => K.editarLinha(ub, m1, { observacao: 'x' })], ['conc.enviar', () => K.enviarParaConferencia(ub, empA, C)],
      ['conc.pedirCorrecao', () => K.pedirCorrecao(ub, [m1], 'fraude')], ['conc.concluir', () => K.concluirConciliacao(ub, empA, C)], ['conc.salvarConta', () => K.salvarContaPlano(ub, empA, { codigo: 9, classificacao: '3.1.1.01.0001', nome: 'Fraude' })], ['conc.fila', () => K.listarConciliacoesEscritorio(ub, C)],
      ['inf.listar', () => I.listarInformesCliente(ub, empA)], ['inf.baixar', () => I.baixarInforme(ub, inf)], ['inf.socios', () => I.listarSocios(ub, empA)], ['inf.historico', () => I.historicoInforme(ub, inf)], ['inf.criar', () => I.criarInforme(ub, empA, { socioId: socio, tipoId: tipo, ano: 2025, nome: 'i.pdf', dados: PDF })], ['inf.nova', () => I.substituirArquivoInforme(ub, inf, 'n.pdf', PDF)],
      ['pend.listar', () => P.listarPendencias(ub, empA)], ['pend.mensagens', () => P.mensagensDaPendencia(ub, pen)], ['pend.responder', () => P.responder(ub, pen, 'invasão')], ['pend.resumo', () => P.resumoPendencias(ub, empA)], ['pend.criar', () => P.criarPendencia(ub, empA, { categoria: 'outro', descricao: 'fraude' })], ['pend.resolver', () => P.resolverPendencia(ub, pen)], ['pend.fila', () => P.listarPendenciasEscritorio(ub)],
      ['emp.obter', () => import('../src/lib/services/empresas').then((m) => m.obterEmpresa(ub, empA))],
    ];
    for (const [nome, fn] of tentativas) { const r = await fn().then(() => 'PASSOU', (e) => (e as { code?: string }).code); expect([nome, r]).toEqual([nome, expect.stringMatching(/^(nao_encontrado|proibido)$/)]); }
    expect(tentativas.length).toBeGreaterThanOrEqual(40);
    // e nada mudou do lado de A
    expect((await K.listarConciliacao(ua, empA, C)).every((l) => !l.correcao_pedida && !l.revisado)).toBe(true); expect((await P.listarPendencias(ua, empA))[0].mensagens).toBe(1);
    expect((await D.situacaoCompetencia(ua, empA, C)).itens[0].situacao).toBe('enviado');
  });
});
afterAll(async () => { await getPool().end(); });

describe('SENHA_POLITICA_BRANDA (opção do dono)', () => {
  it('liga: aceita palavra comum + número, mas mantém o mínimo de 10 caracteres', async () => {
    const { problemaDaSenha } = await import('../src/lib/senha');
    expect(problemaDaSenha('Contvoo10@')).not.toBeNull();
    process.env.SENHA_POLITICA_BRANDA = '1';
    try { expect(problemaDaSenha('Contvoo10@')).toBeNull(); expect(problemaDaSenha('curta')).not.toBeNull(); }
    finally { delete process.env.SENHA_POLITICA_BRANDA; }
  });
});
