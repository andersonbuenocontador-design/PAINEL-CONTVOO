import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import * as P from '../src/lib/services/pendencias';
import { gerarLembretes, processarFila, type EmailProvider } from '../src/lib/notificacoes';
import type { Actor } from '../src/lib/errors';

let admin: Actor, resp: Actor, ua: Actor, ua2: Actor, ub: Actor, empA: string, empB: string;
const dia = async (n: number) => (await query(`SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int)::text d`, [n])).rows[0].d as string;
const fila = async (where = '1=1') => (await query(`SELECT n.*, u.nome destino FROM notificacoes n JOIN usuarios u ON u.id=n.destinatario_id WHERE ${where} ORDER BY n.id`)).rows;
const fake = (falhar = false) => { const enviados: { para: string; assunto: string; texto: string }[] = []; const p: EmailProvider = { nome: 'fake', async enviar(m) { if (falhar) throw new Error('smtp://usuario:segredo@host recusou'); enviados.push(m); } }; return { p, enviados }; };

beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE dicionario_classificacao, conciliacoes, plano_contas, movimentacoes, importacoes, contas_bancarias, arquivos, exigencias, modelo_itens, modelos_documento, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  const adm = async (nome: string, email: string) => ({ id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ($1,$2,'x','admin') RETURNING id`, [nome, email])).rows[0].id as string, papel: 'admin' as const });
  admin = await adm('Admin Geral', 'admin@x.com'); resp = await adm('Ana Responsavel', 'ana@x.com');
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81', responsavelId: resp.id });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  const mk = async (nome: string, email: string, emp: string) => ({ id: await criarUsuario(admin, { nome, email, papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [emp] }), papel: 'cliente' as const });
  ua = await mk('Cliente A', 'a@a.com', empA); ua2 = await mk('Outra A', 'a2@a.com', empA); ub = await mk('Cliente B', 'b@b.com', empB);
});

describe('pendências', () => {
  it('só o escritório cria; avisa os clientes da empresa (com preferência) sem vazar o conteúdo', async () => {
    await expect(P.criarPendencia(ua, empA, { categoria: 'documento', descricao: 'x y z' })).rejects.toMatchObject({ code: 'proibido' });
    await query(`UPDATE usuarios SET receber_emails=false WHERE id=$1`, [ua2.id]);
    const id = await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Falta o extrato do Banrisul de R$ 12.345,67', competencia: '2026-10', prazo: await dia(5), responsavelId: resp.id });
    const f = await fila(); expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ destino: 'Cliente A', tipo: 'pendencia_nova', status: 'pendente', pendencia_id: id });
    expect(f[0].corpo).toContain(`/cliente/${empA}/pendencias`); expect(f[0].corpo + f[0].assunto).not.toMatch(/Banrisul|12\.345|extrato|Empresa A/);
    await expect(P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'ok', })).rejects.toThrow(/Descreva/);
    await expect(P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Algo certo', responsavelId: ua.id })).rejects.toThrow(/Responsável inválido/);
  });
  it('isolamento: cliente de outra empresa não vê, não lê o histórico, não responde', async () => {
    const id = await P.criarPendencia(admin, empA, { categoria: 'informacao', descricao: 'Informe o CNPJ do fornecedor' });
    await expect(P.listarPendencias(ub, empA)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(P.mensagensDaPendencia(ub, id)).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(P.responder(ub, id, 'invasão')).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(P.responder(ub, 'nao-e-uuid', 'x')).rejects.toMatchObject({ code: 'nao_encontrado' });
    await expect(P.resumoPendencias(ub, empA)).rejects.toMatchObject({ code: 'nao_encontrado' });
    expect((await P.listarPendencias(ua2, empA)).map((p) => p.id)).toEqual([id]); // qualquer usuário da empresa
  });
  it('conversa: cliente responde (aguarda escritório), escritório responde (aguarda cliente), resolver/cancelar só admin; encerrada não recebe resposta', async () => {
    const id = await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Envie o contrato social', responsavelId: resp.id });
    await query('DELETE FROM notificacoes');
    await P.responder(ua, id, 'Enviei pelo painel.');
    expect((await P.listarPendencias(ua, empA))[0]).toMatchObject({ situacao: 'respondida', mensagens: 2 });
    let f = await fila(); expect(f.map((x) => [x.destino, x.tipo])).toEqual([['Ana Responsavel', 'pendencia_resposta_cliente']]);
    await P.responder(admin, id, 'Faltou a página 3.');
    expect((await P.listarPendencias(ua, empA))[0].situacao).toBe('aberta');
    f = await fila(`n.tipo='pendencia_resposta_escritorio'`); expect(f.map((x) => x.destino).sort()).toEqual(['Cliente A', 'Outra A']);
    expect((await P.mensagensDaPendencia(ua, id)).map((m) => [m.nome, m.papel])).toEqual([['Admin Geral', 'admin'], ['Cliente A', 'cliente'], ['Admin Geral', 'admin']]);
    await expect(P.resolverPendencia(ua, id)).rejects.toMatchObject({ code: 'proibido' });
    await expect(P.cancelarPendencia(ua, id)).rejects.toMatchObject({ code: 'proibido' });
    await P.resolverPendencia(admin, id);
    await expect(P.responder(ua, id, 'tarde')).rejects.toThrow(/já foi encerrada/);
    await expect(P.resolverPendencia(admin, id)).rejects.toThrow(/em andamento/);
    await P.reabrirPendencia(admin, id); await P.cancelarPendencia(admin, id);
    expect(await P.listarPendencias(ua, empA)).toHaveLength(0); // cancelada some para o cliente
    expect(await P.listarPendencias(admin, empA)).toHaveLength(1);
    await expect(P.mensagensDaPendencia(ua, id)).rejects.toMatchObject({ code: 'nao_encontrado' });
  });
  it('sem responsável, o aviso vai para todos os administradores ativos', async () => {
    const id = await P.criarPendencia(admin, empB, { categoria: 'outro', descricao: 'Confirme os dados' }); await query('DELETE FROM notificacoes');
    await P.responder(ub, id, 'Confirmado.');
    expect((await fila()).map((x) => x.destino).sort()).toEqual(['Admin Geral', 'Ana Responsavel']);
  });
  it('fila do escritório: filtros, vencidas primeiro, resumo do cliente', async () => {
    await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Vencida há dois dias', prazo: await dia(-2) });
    const b = await P.criarPendencia(admin, empA, { categoria: 'classificacao', descricao: 'No prazo', prazo: await dia(3), competencia: '2026-10' });
    await P.criarPendencia(admin, empB, { categoria: 'informacao', descricao: 'Outra empresa' });
    const todas = await P.listarPendenciasEscritorio(admin, { situacao: 'em_andamento' }); expect(todas).toHaveLength(3); expect(todas[0]).toMatchObject({ vencida: true });
    expect(await P.listarPendenciasEscritorio(admin, { vencidas: true })).toHaveLength(1);
    expect((await P.listarPendenciasEscritorio(admin, { categoria: 'classificacao' })).map((p) => p.id)).toEqual([b]);
    expect(await P.listarPendenciasEscritorio(admin, { busca: 'Empresa B' })).toHaveLength(1);
    expect(await P.listarPendenciasEscritorio(admin, { competencia: '2026-10' })).toHaveLength(1);
    expect(await P.resumoPendencias(ua, empA)).toEqual({ aguardando: 2, vencidas: 1, abertas: 2 });
    await expect(P.listarPendenciasEscritorio(ua)).rejects.toMatchObject({ code: 'proibido' });
  });
});

describe('lembretes e fila de e-mails', () => {
  it('lembrete de prazo próximo e vencido, uma vez por pessoa; não lembra quando aguarda o escritório nem quem desligou e-mails', async () => {
    await query(`UPDATE usuarios SET receber_emails=false WHERE id=$1`, [ua2.id]);
    await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Perto do prazo', prazo: await dia(1) });
    await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Vencida', prazo: await dia(-1) });
    const longe = await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Longe', prazo: await dia(10) });
    const resp2 = await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Aguarda escritório', prazo: await dia(0) }); await P.responder(ua, resp2, 'feito');
    await query(`DELETE FROM notificacoes`);
    await gerarLembretes(); await gerarLembretes(); // idempotente
    const f = await fila(); expect(f.map((x) => x.tipo).sort()).toEqual(['pendencia_vencida', 'prazo_proximo']); expect(f.every((x) => x.destino === 'Cliente A')).toBe(true);
    expect(f.some((x) => x.pendencia_id === longe || x.pendencia_id === resp2)).toBe(false);
    expect(f.find((x) => x.tipo === 'prazo_proximo').corpo).toMatch(/vence em \d{2}\/\d{2}\/\d{4}/);
  });
  it('processarFila: envia, registra falha sem vazar segredo, tenta de novo até o limite, respeita desligamento e provedor ausente', async () => {
    await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Algo importante' });
    expect(await processarFila(null)).toEqual({ ativo: false, enviadas: 0, falhas: 0, canceladas: 0 });
    expect((await fila())[0].status).toBe('pendente');
    const ruim = fake(true);
    for (let i = 0; i < 6; i++) await processarFila(ruim.p);
    let n = (await fila())[0]; expect(n).toMatchObject({ status: 'falha', tentativas: 5 }); expect(n.erro).not.toContain('segredo'); expect(n.erro).toContain('***');
    await query(`UPDATE notificacoes SET tentativas=0`);
    const bom = fake(); expect(await processarFila(bom.p)).toMatchObject({ enviadas: 2, falhas: 0 }); // 2 clientes (ua e ua2)
    expect(bom.enviados.map((m) => m.para).sort()).toEqual(['a2@a.com', 'a@a.com']);
    expect((await fila()).every((x) => x.status === 'enviada' && x.enviada_em)).toBe(true);
    expect(await processarFila(bom.p)).toMatchObject({ enviadas: 0 }); // nada novo
  });
  it('cancela se o usuário foi bloqueado ou desligou e-mails depois; duas execuções simultâneas não duplicam envio', async () => {
    await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Algo importante' });
    await query(`UPDATE usuarios SET receber_emails=false WHERE id=$1`, [ua2.id]);
    const a = fake(); const b = fake();
    await Promise.all([processarFila(a.p), processarFila(b.p)]);
    expect(a.enviados.length + b.enviados.length).toBe(1);
    await P.criarPendencia(admin, empA, { categoria: 'documento', descricao: 'Outra coisa' }); await query(`UPDATE usuarios SET ativo=false WHERE id=$1`, [ua.id]);
    // o aviso novo já foi gerado para o ua (ativo na criação) mas ele foi bloqueado antes do envio
    const c = fake(); await processarFila(c.p); expect(c.enviados).toHaveLength(0);
    expect((await fila(`n.status='cancelada'`)).length).toBeGreaterThan(0);
  });
});
afterAll(async () => { await getPool().end(); });
