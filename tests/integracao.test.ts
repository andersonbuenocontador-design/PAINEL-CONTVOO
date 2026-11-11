import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa, editarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import { conferirArquivo, criarExigencia, enviarArquivo } from '../src/lib/services/documentos';
import { autorizado, extratosPendentes, registrarCobrancaEnviada } from '../src/lib/services/integracao';
import type { Actor } from '../src/lib/errors';

const C = '2026-10'; const PDF = Buffer.from('%PDF-1.4 x');
let admin: Actor, ua: Actor, empA: string, empB: string, exA: string, exA2: string;
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE pendencia_mensagens, pendencias, arquivos, exigencias, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', nomeFantasia: 'Padaria A', cnpj: '11.222.333/0001-81', whatsapp: '(51) 99999-0000' });
  empB = await criarEmpresa(admin, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10' });
  ua = { id: await criarUsuario(admin, { nome: 'Joana Prado', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
  exA = await criarExigencia(admin, empA, { nome: 'Extrato Sicredi', instituicao: 'Sicredi', formatos: ['pdf'] });
  exA2 = await criarExigencia(admin, empA, { nome: 'Extrato Nubank', formatos: ['pdf'] });
  await criarExigencia(admin, empA, { nome: 'Folha de pagamento', formatos: ['pdf'] });
  await criarExigencia(admin, empB, { nome: 'Extrato BB', formatos: ['pdf'] });
  process.env.APP_URL = 'https://painel.exemplo';
});
afterAll(() => getPool().end());

describe('integração n8n: cobrança de extratos', () => {
  it('só extratos pendentes ou recusados; separa quem não tem WhatsApp; mensagem pronta com link', async () => {
    const a = await enviarArquivo(ua, { empresaId: empA, exigenciaId: exA2, competencia: C, nome: 'n.pdf', dados: PDF });
    await conferirArquivo(admin, a, 'rejeitado', 'mês errado');
    const r = await extratosPendentes(C);
    expect(r.comWhatsapp).toHaveLength(1);
    const e = r.comWhatsapp[0];
    expect(e).toMatchObject({ empresaId: empA, empresa: 'Padaria A', whatsapp: '5551999990000', contato: 'Joana Prado' });
    expect(e.faltam.map((f) => [f.documento, f.situacao])).toEqual([['Extrato Nubank', 'rejeitado'], ['Extrato Sicredi', 'pendente']]);
    expect(e.mensagem).toContain('Olá, Joana!'); expect(e.mensagem).toContain('outubro/2026'); expect(e.mensagem).toContain('mês errado');
    expect(e.mensagem).not.toContain('Folha'); expect(e.mensagem).toContain(`https://painel.exemplo/cliente/${empA}/documentos?competencia=${C}`);
    expect(r.semWhatsapp).toEqual([{ empresaId: empB, empresa: 'Empresa B Ltda' }]);
    await enviarArquivo(ua, { empresaId: empA, exigenciaId: exA, competencia: C, nome: 's.pdf', dados: PDF });
    expect((await extratosPendentes(C)).comWhatsapp[0].faltam).toHaveLength(1);
  });
  it('registrar cobrança enviada cria a cobrança no painel; falha só fica na auditoria', async () => {
    expect(await registrarCobrancaEnviada({ empresaId: empA, competencia: C, enviada: false, detalhe: 'número inválido' })).toEqual({ registrada: true, cobranca: false });
    expect((await query(`SELECT count(*)::int n FROM pendencias WHERE empresa_id=$1`, [empA])).rows[0].n).toBe(0);
    expect(await registrarCobrancaEnviada({ empresaId: empA, competencia: C, enviada: true })).toEqual({ registrada: true, cobranca: true });
    expect((await query(`SELECT count(*)::int n FROM pendencias WHERE empresa_id=$1`, [empA])).rows[0].n).toBe(1);
    const acoes = (await query(`SELECT acao FROM auditoria WHERE acao LIKE 'cobranca.whatsapp%' ORDER BY id`)).rows.map((x) => x.acao);
    expect(acoes).toEqual(['cobranca.whatsapp_falhou', 'cobranca.whatsapp_enviada']);
  });
  it('token: sem configurar, errado e certo; WhatsApp editável', async () => {
    delete process.env.INTEGRACAO_TOKEN; delete process.env.N8N_CONCILIACAO_TOKEN;
    const req = (t?: string) => new Request('http://x', { headers: t ? { authorization: `Bearer ${t}` } : {} });
    expect(autorizado(req('qualquer'))).toBe('sem-token');
    process.env.N8N_CONCILIACAO_TOKEN = 'senha-da-conciliacao-0123456789';
    expect(autorizado(req('senha-da-conciliacao-0123456789'))).toBe('ok');
    process.env.INTEGRACAO_TOKEN = 'abcdefghijklmnopqrstuvwxyz123456';
    expect(autorizado(req('errado'))).toBe('negado'); expect(autorizado(req())).toBe('negado');
    expect(autorizado(req('abcdefghijklmnopqrstuvwxyz123456'))).toBe('ok');
    await editarEmpresa(admin, empB, { razaoSocial: 'Empresa B Ltda', cnpj: '45.723.174/0001-10', whatsapp: '51 98888-1111' });
    expect((await extratosPendentes(C)).comWhatsapp.map((e) => e.whatsapp).sort()).toEqual(['5551988881111', '5551999990000']);
  });
});
