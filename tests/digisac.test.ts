import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, query } from '../src/lib/db';
import { variantesNumero, desligarDigisac, digisacPronto, enviarTesteDigisac, enviarWhatsappDigisac, escolherConexao, listarConexoes, salvarAcessoDigisac, statusDigisac } from '../src/lib/services/digisac';
import type { Actor } from '../src/lib/errors';

let admin: Actor; const cli: Actor = { id: '00000000-0000-0000-0000-000000000000', papel: 'cliente' };
const TOKEN = 'chave-secreta-do-digisac-123456';
const resp = (status: number, corpo: unknown) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
beforeEach(async () => {
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria DISABLE TRIGGER auditoria_${t}`);
  await query('TRUNCATE configuracoes, usuarios, auditoria CASCADE');
  for (const t of ['no_update', 'no_truncate']) await query(`ALTER TABLE auditoria ENABLE TRIGGER auditoria_${t}`);
  admin = { id: (await query(`INSERT INTO usuarios(nome,email,senha_hash,papel) VALUES ('Admin','admin@x.com','x','admin') RETURNING id`)).rows[0].id, papel: 'admin' };
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => getPool().end());

describe('WhatsApp pelo Digisac', () => {
  it('salva endereço (normalizado) e chave cifrada; só o escritório; chave nunca volta para a tela', async () => {
    await expect(salvarAcessoDigisac(cli, { url: 'https://x.digisac.biz', token: TOKEN })).rejects.toMatchObject({ code: 'proibido' });
    await expect(salvarAcessoDigisac(admin, { url: 'https://x.digisac.biz' })).rejects.toThrow(/Cole a chave/);
    await expect(salvarAcessoDigisac(admin, { url: 'contvoo', token: TOKEN })).rejects.toThrow(/endereço/);
    await salvarAcessoDigisac(admin, { url: 'https://contvoocontabilidade.digisac.biz/api/v1/', token: TOKEN });
    const st = await statusDigisac(admin);
    expect(st).toEqual({ temChave: true, url: 'https://contvoocontabilidade.digisac.biz', serviceId: null, serviceNome: null, pronto: false });
    const guardado = (await query(`SELECT valor FROM configuracoes WHERE chave='digisac_token'`)).rows[0].valor as string;
    expect(guardado).not.toContain(TOKEN); expect(guardado.startsWith('v1.')).toBe(true);
    await salvarAcessoDigisac(admin, { url: 'https://contvoocontabilidade.digisac.biz' }); // sem chave: mantém a atual
    expect((await statusDigisac(admin)).temChave).toBe(true);
  });
  it('lista conexões (WhatsApp primeiro), escolhe, envia com o corpo certo e explica erros', async () => {
    await salvarAcessoDigisac(admin, { url: 'https://contvoocontabilidade.digisac.biz', token: TOKEN });
    const chamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { chamadas.push({ url, init });
      return url.includes('/services') ? resp(200, { data: [{ id: 's2', name: 'Instagram', type: 'instagram' }, { id: 's1', name: 'WhatsApp Escritório', type: 'whatsapp' }] }) : resp(200, { id: 'm1' }); }));
    expect(await listarConexoes(admin)).toEqual([{ id: 's1', nome: 'WhatsApp Escritório', tipo: 'whatsapp' }, { id: 's2', nome: 'Instagram', tipo: 'instagram' }]);
    expect(chamadas[0].url).toBe('https://contvoocontabilidade.digisac.biz/api/v1/services?perPage=100');
    expect((chamadas[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(await digisacPronto()).toBe(false);
    await expect(enviarWhatsappDigisac('51999990000', 'oi')).rejects.toThrow(/ainda não foi configurado/);
    await escolherConexao(admin, 's1', 'WhatsApp Escritório');
    expect(await digisacPronto()).toBe(true);
    // contato achado pelo número (sem o 9 extra, como o WhatsApp guarda): envia para o contato
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { chamadas.push({ url, init });
      return url.includes('/contacts') ? resp(200, { data: [{ id: 'c9', serviceId: 's1' }] }) : resp(200, { id: 'm1' }); }));
    await enviarWhatsappDigisac('(51) 99999-0000', 'Olá!');
    const busca = decodeURIComponent(chamadas.at(-2)!.url);
    expect(busca).toContain('/contacts?query='); expect(busca).toContain('"data.number":{"$in":["5551999990000","555199990000"]}');
    expect(JSON.parse(chamadas.at(-1)!.init.body as string)).toEqual({ text: 'Olá!', type: 'chat', contactId: 'c9', origin: 'bot' });
    // sem contato: tenta direto para o número pela conexão
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { chamadas.push({ url, init });
      return url.includes('/contacts') ? resp(200, { data: [] }) : resp(200, { id: 'm2' }); }));
    await enviarWhatsappDigisac('51999990000', 'Oi');
    const env = chamadas.at(-1)!;
    expect(env.url).toBe('https://contvoocontabilidade.digisac.biz/api/v1/messages'); expect(env.init.method).toBe('POST');
    expect(JSON.parse(env.init.body as string)).toEqual({ text: 'Oi', type: 'chat', number: '5551999990000', serviceId: 's1', origin: 'bot' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/contacts') ? resp(200, { data: [] }) : resp(400, { message: 'number not allowed' })));
    await expect(enviarWhatsappDigisac('51999990000', 'x')).rejects.toThrow(/não está nos contatos do Digisac/);
    expect(variantesNumero('555199990000')).toEqual(['555199990000', '5551999990000']);
    vi.stubGlobal('fetch', vi.fn(async () => resp(200, { id: 'ok' })));
    await expect(enviarWhatsappDigisac('123', 'x')).rejects.toThrow(/Número de WhatsApp inválido/);
    vi.stubGlobal('fetch', vi.fn(async () => resp(401, 'Unauthorized')));
    await expect(enviarTesteDigisac(admin, '51999990000')).rejects.toThrow(/recusou a chave/);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/contacts') ? resp(200, { data: [{ id: 'c1' }] }) : resp(422, { message: 'texto inválido' })));
    await expect(enviarWhatsappDigisac('51999990000', 'x')).rejects.toThrow(/erro 422.*texto inválido/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ENOTFOUND'); }));
    await expect(enviarWhatsappDigisac('51999990000', 'x')).rejects.toThrow(/Não foi possível falar com o Digisac|não está nos contatos/);
    await desligarDigisac(admin);
    expect(await statusDigisac(admin)).toMatchObject({ temChave: false, pronto: false });
  });
});
