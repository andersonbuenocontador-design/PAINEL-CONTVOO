import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { criarEmpresa } from '../src/lib/services/empresas';
import { celularDe, importarGclick, previaGclick, salvarAcessoGclick, statusGclick } from '../src/lib/services/gclick';
import type { Actor } from '../src/lib/errors';

let admin: Actor, empA: string;
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });
const CLIENTES = [
  { id: 101, nome: 'EMPRESA A LTDA', apelido: 'Padaria A', inscricao: '11.222.333/0001-81', tipoInscricao: 'CNPJ', status: 'Ativo', telefones: [{ numero: '(51) 3333-4444' }, { numero: '51 99999-0000' }] },
  { id: 102, nome: 'OFICINA NOVA LTDA', apelido: 'Oficina Nova', inscricao: '45723174000110', tipoInscricao: 'CNPJ', status: 'Ativo', telefones: [{ numero: '+55 (51) 98888-1111' }] },
  { id: 103, nome: 'JOSÉ PESSOA FÍSICA', apelido: null, inscricao: '529.712.440-91', tipoInscricao: 'CPF', status: 'Ativo', telefones: [] },
];
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE configuracoes, plano_contas, usuario_empresas, empresas, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
  empA = await criarEmpresa(admin, { razaoSocial: 'Empresa A Ltda', cnpj: '11.222.333/0001-81' });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/oauth/token') ? resp(200, { access_token: 'tk', expires_in: 3600 })
    : url.includes('/clientes') ? resp(200, { content: url.includes('page=0') ? CLIENTES : [], last: true }) : resp(404, {})));
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => getPool().end());

describe('G-Click: importar clientes', () => {
  it('celular brasileiro entre os telefones', () => {
    expect(celularDe([{ numero: '(51) 3333-4444' }, { numero: '51 99999-0000' }])).toBe('5551999990000');
    expect(celularDe([{ numero: '+55 (51) 98888-1111' }])).toBe('5551988881111');
    expect(celularDe([{ numero: '051 99999-0000' }])).toBe('5551999990000');
    expect(celularDe([{ numero: '3333-4444' }])).toBeNull(); expect(celularDe(null)).toBeNull();
  });
  it('liga pelo CNPJ, completa só o que está vazio, cadastra as escolhidas e ignora CPF', async () => {
    await expect(previaGclick(admin)).rejects.toThrow(/Ligue o G-Click/);
    await salvarAcessoGclick(admin, { clientId: 'cid', segredo: 'segredo-gclick' });
    expect(await statusGclick(admin)).toEqual({ ligado: true, clientId: 'cid' });
    expect((await query(`SELECT valor FROM configuracoes WHERE chave='gclick_client_secret'`)).rows[0].valor).not.toContain('segredo-gclick');
    const p = await previaGclick(admin);
    expect(p.ligadas).toEqual([{ empresaId: empA, razao: 'Empresa A Ltda', gclickId: 101, whatsappNovo: '5551999990000', apelidoNovo: 'Padaria A' }]);
    expect(p.novas.map((n) => [n.gclickId, n.cnpj, n.whatsapp])).toEqual([[102, '45723174000110', '5551988881111']]);
    expect(p.semCnpj).toBe(1);
    expect(await query('SELECT count(*)::int n FROM empresas').then((r) => r.rows[0].n)).toBe(1); // prévia não grava
    expect(await importarGclick(admin, [102])).toEqual({ ligadas: 1, criadas: 1, whatsapps: 2 });
    const rows = (await query('SELECT cnpj, nome_fantasia, whatsapp, gclick_id::int g FROM empresas ORDER BY cnpj')).rows;
    expect(rows).toEqual([{ cnpj: '11222333000181', nome_fantasia: 'Padaria A', whatsapp: '5551999990000', g: 101 }, { cnpj: '45723174000110', nome_fantasia: 'Oficina Nova', whatsapp: '5551988881111', g: 102 }]);
    expect((await query(`SELECT count(*)::int n FROM plano_contas p JOIN empresas e ON e.id=p.empresa_id WHERE e.gclick_id=102`)).rows[0].n).toBeGreaterThan(0);
    // segunda vez: nada sobrescrito, nada duplicado
    await query(`UPDATE empresas SET whatsapp='5551911112222' WHERE id=$1`, [empA]);
    expect(await importarGclick(admin, [102])).toMatchObject({ ligadas: 2, criadas: 0 });
    expect((await query('SELECT whatsapp FROM empresas WHERE id=$1', [empA])).rows[0].whatsapp).toBe('5551911112222');
  });
  it('credencial recusada e acesso só do escritório', async () => {
    await salvarAcessoGclick(admin, { clientId: 'cid', segredo: 's' });
    vi.stubGlobal('fetch', vi.fn(async () => resp(401, {})));
    await expect(previaGclick(admin)).rejects.toThrow(/recusou o client_id/);
    await expect(previaGclick({ id: admin.id, papel: 'cliente' })).rejects.toMatchObject({ code: 'proibido' });
  });
});
