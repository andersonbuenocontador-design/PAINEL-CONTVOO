import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const enviados: { numero: string; texto: string }[] = [];
vi.mock('../src/lib/services/digisac', () => ({
  digisacPronto: async () => true,
  enviarWhatsappDigisac: async (numero: string, t: string | ((n: string) => string)) => {
    if (numero.endsWith('0000')) throw new Error('número recusado');
    enviados.push({ numero, texto: typeof t === 'function' ? t('Maria Souza Lima') : t });
  },
}));
import { getPool, query } from '../src/lib/db';
import { salvarAcessoGclick } from '../src/lib/services/gclick';
import { enviarPorGclick, enviarPorWhatsapp, executarAgenda, lerAgenda, lerConfigSolicitacao, previaSolicitacao, proximoEnvio, salvarAgenda, salvarConfigSolicitacao } from '../src/lib/services/gclick-solicitacao';
import type { Actor } from '../src/lib/errors';

let admin: Actor; let posts: Record<string, string>[]; let estado: Record<string, { c?: string; e?: string }>; let ignorarN = false;
const COM_EMAIL = new Set(['4.1', '4.4', '4.5']);
const resp = (status: number, corpo: unknown) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
const NOME = 'Solicitação de Documentos Contábeis';
const TAREFAS = [
  { id: '4.1', nome: NOME, status: 'A', clienteId: 1, clienteInscricao: '11222333000181', dataCompetencia: '2026-11-01', dataVencimento: '2026-12-10' },
  { id: '4.2', nome: NOME, status: 'A', clienteId: 2, clienteInscricao: '45723174000110', dataCompetencia: '2026-11-01', dataVencimento: '2026-12-10' },
  { id: '4.3', nome: NOME, status: 'A', clienteId: 3, clienteInscricao: '11444777000161', dataCompetencia: '2026-11-01', dataVencimento: '2026-12-10' },
  { id: '4.4', nome: NOME, status: 'A', clienteId: 4, clienteInscricao: '12345678000195', dataCompetencia: '2026-11-01', dataVencimento: '2026-12-10' },
  { id: '4.5', nome: NOME, status: 'C', clienteId: 5, clienteInscricao: '98765432000198', dataCompetencia: '2026-11-01', dataVencimento: '2026-12-10' },
  { id: '4.6', nome: 'Relação de Documentos para Tomador', status: 'A', clienteId: 1, dataCompetencia: '2026-11-01' }, // filtro de nome do G-Click é parcial
  { id: '4.7', nome: NOME, status: 'A', clienteId: 6, clienteInscricao: '11222333000262', dataCompetencia: '2026-11-01', dataVencimento: '2026-12-10' },
];
const CLIENTES = [
  { id: 1, nome: 'PADARIA A LTDA', apelido: 'Padaria A', emails: [{ email: 'a@padaria.com' }], telefones: [] },
  { id: 2, nome: 'OFICINA B LTDA', apelido: 'Oficina B', emails: [{ email: '' }], telefones: [{ numero: '(51) 98888-1111' }] },
  { id: 3, nome: 'LOJA C LTDA', apelido: 'Loja C', emails: [], telefones: [{ numero: '(51) 3333-4444' }] },
  { id: 4, nome: 'MERCADO D LTDA', apelido: 'Mercado D', emails: [{ email: 'd@mercado.com' }, { email: 'x@y.com' }], telefones: [] },
  { id: 5, nome: 'E LTDA', apelido: 'E', emails: [{ email: 'e@e.com' }], telefones: [] },
  { id: 6, nome: 'BAR F LTDA', apelido: 'Bar F', emails: null, telefones: [{ numero: '51 97777-0000' }] },
];
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE gclick_envios, configuracoes, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  posts = []; estado = { '4.4': { c: 'S', e: 'S' } }; ignorarN = false; enviados.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/oauth/token')) return resp(200, { access_token: 'tk' });
    if (url.includes('/clientes')) return resp(200, { content: url.includes('page=0') ? CLIENTES : [], last: true });
    if (url.includes('/tarefas?')) { const q = new URL(url).searchParams; expect(q.get('dataCompetenciaInicio')).toBe('2026-11-01'); expect(q.get('dataCompetenciaFim')).toBe('2026-11-30'); return resp(200, { content: TAREFAS, last: true }); }
    const m = url.match(/\/tarefas\/([\d.]+)\/atividades$/);
    if (m) { const st = estado[m[1]] ?? {}; const a = (id: string, nome: string, ordem: string, tipo: string, v?: string) => ({ id, nome, ordem, tipo, respondida: !!v, resposta: v ? { nome: v } : null });
      return resp(200, [a(`${m[1]}8`, 'Enviar para o cliente', '2', 'E', st.e), a(`${m[1]}9`, NOME, '1', 'C', st.c)]); }
    if (url.endsWith('/atividades/resposta')) {
      const f = Object.fromEntries((init!.body as FormData).entries()) as Record<string, string>; posts.push(f);
      const tarefa = f.idAtividade.slice(0, -1); const st = (estado[tarefa] ??= {});
      if (f.idAtividade.endsWith('9')) { st.c = 'S'; if (COM_EMAIL.has(tarefa) && !st.e) st.e = 'S'; } // ✔ no checklist: o G-Click manda o e-mail sozinho
      else st.e = f.resposta === 'N' && !ignorarN ? 'N' : 'S';
      return resp(200, '{"status":"sucesso"}');
    }
    return resp(404, {});
  }));
  await salvarAcessoGclick(admin, { clientId: 'cid', segredo: 's' });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => getPool().end());

describe('G-Click: solicitação de documentos', () => {
  it('prévia separa quem tem e-mail, quem vai por WhatsApp e quem não tem contato (só leitura)', async () => {
    const p = await previaSolicitacao(admin, '2026-11');
    expect(p).toMatchObject({ total: 6, concluidas: 1, mes: 'novembro/2026' });
    expect(p.porEmail.map((x) => [x.empresa, x.emails])).toEqual([['Mercado D', 2], ['Padaria A', 1]]);
    expect(p.porWhatsapp.map((x) => [x.empresa, x.celular])).toEqual([['Bar F', '5551977770000'], ['Oficina B', '5551988881111']]);
    expect(p.semContato.map((x) => x.empresa)).toEqual(['Loja C']);
    expect(posts).toEqual([]); expect(enviados).toEqual([]);
  });
  it('e-mail: exige o código do sistema; dá o ✔ com os campos certos; pula quem já tem ✔; não repete no 2º clique', async () => {
    await expect(enviarPorGclick(admin, { competencia: '2026-11', teste: false })).rejects.toThrow(/sistema/);
    await salvarConfigSolicitacao(admin, { sistema: 'SIS9', usuario: '', tarefa: NOME, mensagem: '' });
    expect(await enviarPorGclick(admin, { competencia: '2026-11', teste: true })).toMatchObject({ enviados: 1, erros: 0 });
    // Mercado D (4.4) vem primeiro e já tinha ✔: registrado sem POST
    expect(posts).toEqual([]);
    expect(await enviarPorGclick(admin, { competencia: '2026-11', teste: false })).toMatchObject({ enviados: 1, erros: 0 });
    expect(posts).toEqual([{ idAtividade: '4.19', competencia: '202611', inscricao: '11222333000181', usuario: 'gclickbot', sistema: 'SIS9' }]);
    expect(await enviarPorGclick(admin, { competencia: '2026-11', teste: false })).toMatchObject({ enviados: 0 });
    expect(posts).toHaveLength(1);
    const p = await previaSolicitacao(admin, '2026-11');
    expect(p.porEmail.map((x) => x.envio?.status)).toEqual(['ok', 'ok']);
    expect(p.porEmail[0].envio?.detalhe).toMatch(/já estava/);
  });
  it('e-mail: erro do G-Click fica registrado e pode ser tentado de novo', async () => {
    await salvarConfigSolicitacao(admin, { sistema: 'X', usuario: 'robo', tarefa: NOME, mensagem: '' });
    const f = fetch as unknown as ReturnType<typeof vi.fn>; const orig = f.getMockImplementation()!;
    f.mockImplementation(async (url: string, init?: RequestInit) => url.endsWith('/atividades/resposta') ? resp(200, '{"status":"erro","msg":"Sistema X não encontrado"}') : orig(url, init));
    const r = await enviarPorGclick(admin, { competencia: '2026-11', teste: false });
    expect(r).toMatchObject({ enviados: 1, erros: 1 }); expect(r.primeiroErro).toMatch(/Padaria A: G-Click: Sistema X não encontrado/);
    f.mockImplementation(orig);
    expect(await enviarPorGclick(admin, { competencia: '2026-11', teste: false })).toMatchObject({ enviados: 1, erros: 0 });
    expect(posts.at(-1)).toMatchObject({ usuario: 'robo', sistema: 'X' });
  });
  it('WhatsApp: mensagem padrão com nome do contato, competência e vencimento; erro registrado; não repete', async () => {
    const r = await enviarPorWhatsapp(admin, { competencia: '2026-11', teste: false });
    expect(r).toMatchObject({ enviados: 1, erros: 1 }); expect(r.primeiroErro).toMatch(/Bar F: número recusado/);
    expect(enviados).toHaveLength(1); expect(enviados[0].numero).toBe('5551988881111');
    expect(enviados[0].texto).toMatch(/^Olá, Maria Souza Lima!/); expect(enviados[0].texto).toContain('novembro/2026 da Oficina B'); expect(enviados[0].texto).toContain('até 10/12/2026');
    await enviarPorWhatsapp(admin, { competencia: '2026-11', teste: false });
    expect(enviados.filter((e) => e.numero === '5551988881111')).toHaveLength(1);
    expect(posts).toEqual([]);
  });
  it('configuração: texto padrão não fica gravado; personalizado sim; só escritório', async () => {
    await salvarConfigSolicitacao(admin, { sistema: ' S1 ', usuario: '', tarefa: NOME, mensagem: 'Oi {nome}, mande {mes}.' });
    expect(await lerConfigSolicitacao()).toMatchObject({ sistema: 'S1', usuario: 'gclickbot', mensagem: 'Oi {nome}, mande {mes}.', mensagemPersonalizada: true });
    await expect(previaSolicitacao({ id: admin.id, papel: 'cliente' }, '2026-11')).rejects.toMatchObject({ code: 'proibido' });
  });
  it('envio automático: só no dia/hora (Brasília), competência anterior, uma vez; desligado não envia', async () => {
    // 04/12/2026 08h de Brasília = 11h UTC
    const em = (dia: number, horaBr: number) => new Date(Date.UTC(2026, 11, dia, horaBr + 3, 10));
    expect(await executarAgenda(em(4, 9))).toEqual({ rodou: false, motivo: 'desligado' });
    await expect(salvarAgenda(admin, { ativo: true, dia: 4, hora: 8, email: true, whatsapp: true })).rejects.toThrow(/sistema/);
    await salvarConfigSolicitacao(admin, { sistema: 'SIS9', usuario: '', tarefa: NOME, mensagem: '' });
    await expect(salvarAgenda(admin, { ativo: true, dia: 4, hora: 8, email: false, whatsapp: false })).rejects.toThrow(/canal/);
    await salvarAgenda(admin, { ativo: true, dia: 4, hora: 8, email: true, whatsapp: true });
    const { agenda } = await lerAgenda();
    expect(proximoEnvio(agenda, null, em(1, 10))).toEqual({ data: '04/12/2026', hora: 8, competencia: '2026-11', atrasado: false });
    expect(proximoEnvio(agenda, null, em(20, 10))).toMatchObject({ data: '04/01/2027', competencia: '2026-12' });
    expect(await executarAgenda(em(4, 7))).toMatchObject({ rodou: false, motivo: 'fora do dia/hora' });
    expect(await executarAgenda(em(3, 15))).toMatchObject({ rodou: false });
    const r = await executarAgenda(em(4, 8));
    expect(r).toMatchObject({ rodou: true, competencia: '2026-11' });
    expect((r as { resumo: string }).resumo).toMatch(/E-mail pelo G-Click: 2 enviado\(s\).*WhatsApp: 1 enviado\(s\), 1 com X\/✔ no G-Click, 1 com erro/);
    expect(posts).toHaveLength(3); expect(enviados).toHaveLength(1);
    expect(await executarAgenda(em(4, 9))).toEqual({ rodou: false, motivo: 'já rodou nesta competência' });
    expect(await executarAgenda(em(5, 9))).toEqual({ rodou: false, motivo: 'já rodou nesta competência' });
    expect(posts).toHaveLength(3); expect(enviados).toHaveLength(1);
    expect((await lerAgenda()).ultima).toMatchObject({ competencia: '2026-11' });
    expect(proximoEnvio(agenda, (await lerAgenda()).ultima, em(4, 10))).toMatchObject({ data: '04/01/2027' });
  });
  it('envio automático: atrasado (site fora do ar no dia) roda até 2 dias depois, não no 3º', async () => {
    await salvarAgenda(admin, { ativo: true, dia: 4, hora: 8, email: false, whatsapp: true });
    expect(await executarAgenda(new Date(Date.UTC(2026, 11, 7, 12)))).toMatchObject({ rodou: false, motivo: 'fora do dia/hora' });
    expect(await executarAgenda(new Date(Date.UTC(2026, 11, 6, 12)))).toMatchObject({ rodou: true, competencia: '2026-11' });
  });
  it('sem e-mail: depois do WhatsApp, X em "Enviar para o cliente" (com o motivo) e ✔ no checklist, nessa ordem; confere no G-Click', async () => {
    await salvarConfigSolicitacao(admin, { sistema: 'SIS9', usuario: '', tarefa: NOME, motivoSemEmail: '', mensagem: '' });
    const r = await enviarPorWhatsapp(admin, { competencia: '2026-11', teste: false });
    expect(r).toMatchObject({ enviados: 1, marcados: 1, erros: 1 }); // Bar F: WhatsApp recusado => não marca no G-Click
    expect(posts).toEqual([
      { idAtividade: '4.28', competencia: '202611', inscricao: '45723174000110', usuario: 'gclickbot', sistema: 'SIS9', resposta: 'N', observacao: 'Empresa não tem e-mail cadastrado' },
      { idAtividade: '4.29', competencia: '202611', inscricao: '45723174000110', usuario: 'gclickbot', sistema: 'SIS9' },
    ]);
    expect(estado['4.2']).toEqual({ c: 'S', e: 'N' }); expect(estado['4.7']).toBeUndefined();
    const p = await previaSolicitacao(admin, '2026-11');
    expect(p.porWhatsapp.find((x) => x.empresa === 'Oficina B')).toMatchObject({ envio: { status: 'ok' }, gclick: { status: 'ok' } });
    // 2º clique: nada de novo para a Oficina B
    await enviarPorWhatsapp(admin, { competencia: '2026-11', teste: false });
    expect(posts).toHaveLength(2); expect(enviados).toHaveLength(1);
  });
  it('sem e-mail: se o G-Click não registrar o X pela API, para (sem ✔) e avisa para marcar à mão; WhatsApp não é reenviado', async () => {
    await salvarConfigSolicitacao(admin, { sistema: 'SIS9', usuario: '', tarefa: NOME, mensagem: '' });
    ignorarN = true;
    const r = await enviarPorWhatsapp(admin, { competencia: '2026-11', teste: false });
    expect(r).toMatchObject({ enviados: 1, marcados: 0, erros: 2 });
    expect(r.primeiroErro).toMatch(/Bar F: número recusado/);
    expect(posts.map((x) => x.idAtividade)).toEqual(['4.28']); // Oficina B: tentou o X e parou antes do ✔
    const p = await previaSolicitacao(admin, '2026-11'); const of = p.porWhatsapp.find((x) => x.empresa === 'Oficina B')!;
    expect(of.envio?.status).toBe('ok'); expect(of.gclick).toMatchObject({ status: 'erro' }); expect(of.gclick?.detalhe).toMatch(/não registrou o X.*ficou "S".*à mão/);
    ignorarN = false; await enviarPorWhatsapp(admin, { competencia: '2026-11', teste: false });
    expect(enviados.filter((e) => e.numero === '5551988881111')).toHaveLength(1); // WhatsApp não repete; só tenta o G-Click de novo
    expect((await previaSolicitacao(admin, '2026-11')).porWhatsapp.find((x) => x.empresa === 'Oficina B')!.gclick?.detalhe).toMatch(/está como "S".*troque para X à mão/);
  });
});
