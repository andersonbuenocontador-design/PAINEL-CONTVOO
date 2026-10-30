import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { criarUsuario } from '../src/lib/services/usuarios';
import { conferirArquivo, criarExigencia, enviarArquivo } from '../src/lib/services/documentos';
import { cobrancasAbertas, cobrarDocumentos } from '../src/lib/services/cobranca';
import { listarPendencias, resumoPendencias } from '../src/lib/services/pendencias';
import type { Actor } from '../src/lib/errors';

const PDF = Buffer.from('%PDF-1.4 teste'); const C = '2026-10';
let admin: Actor, ua: Actor, empA: string, ex1: string, ex2: string;

beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE pendencia_mensagens, pendencias, arquivos, exigencias, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  ua = { id: await criarUsuario(admin, { nome: 'Cliente A', email: 'a@a.com', papel: 'cliente', senhaTemporaria: 'SenhaTemp#12345', empresaIds: [empA] }), papel: 'cliente' };
  ex1 = await criarExigencia(admin, empA, { nome: 'Extrato', instituicao: 'Banrisul', formatos: ['pdf'] });
  ex2 = await criarExigencia(admin, empA, { nome: 'Folha de pagamento', formatos: ['pdf'] });
});
afterAll(() => getPool().end());

describe('cobrar envio de documentos (Entregas do mês)', () => {
  it('cria solicitação no painel do cliente com o que falta, sem duplicar', async () => {
    await enviarArquivo(ua, { empresaId: empA, exigenciaId: ex1, competencia: C, nome: 'e.pdf', dados: PDF });
    const id = await cobrarDocumentos(admin, empA, C);
    const p = (await listarPendencias(ua, empA)).find((x) => x.id === id)!;
    expect(p.descricao).toContain('Faltam documentos de 10/2026'); expect(p.descricao).toContain('• Folha de pagamento'); expect(p.descricao).not.toContain('Extrato');
    expect(p.situacao).toBe('aberta'); expect((await resumoPendencias(ua, empA)).aguardando).toBe(1);
    expect((await cobrancasAbertas(admin, C)).has(empA)).toBe(true);
    await expect(cobrarDocumentos(admin, empA, C)).rejects.toThrow(/Já existe uma cobrança/);
    await expect(cobrarDocumentos(ua, empA, C)).rejects.toMatchObject({ code: 'proibido' });
  });
  it('documento recusado entra na cobrança com o motivo', async () => {
    const a = await enviarArquivo(ua, { empresaId: empA, exigenciaId: ex1, competencia: C, nome: 'e.pdf', dados: PDF });
    await enviarArquivo(ua, { empresaId: empA, exigenciaId: ex2, competencia: C, nome: 'f.pdf', dados: PDF });
    await conferirArquivo(admin, a, 'rejeitado', 'ilegível');
    const id = await cobrarDocumentos(admin, empA, C);
    expect((await listarPendencias(admin, empA)).find((x) => x.id === id)!.descricao).toContain('• Extrato — Banrisul (recusado: ilegível; envie de novo)');
  });
  it('encerra sozinha quando o cliente envia tudo; nada a cobrar quando completo', async () => {
    await cobrarDocumentos(admin, empA, C);
    await enviarArquivo(ua, { empresaId: empA, exigenciaId: ex1, competencia: C, nome: 'e.pdf', dados: PDF });
    expect((await cobrancasAbertas(admin, C)).has(empA)).toBe(true); // ainda falta a folha
    await enviarArquivo(ua, { empresaId: empA, exigenciaId: ex2, competencia: C, nome: 'f.pdf', dados: PDF });
    expect((await cobrancasAbertas(admin, C)).has(empA)).toBe(false);
    expect((await resumoPendencias(ua, empA)).aguardando).toBe(0);
    await expect(cobrarDocumentos(admin, empA, C)).rejects.toThrow(/já enviou todos/);
  });
});
