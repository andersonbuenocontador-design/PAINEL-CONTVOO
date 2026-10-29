import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apagar, armazenamentoOk, gravar, ler, prepararArmazenamento } from '../src/lib/storage';
import { configPg } from '../src/lib/db';
import { provedorPadrao, remetente } from '../src/lib/notificacoes';

type Chamada = { url: string; init: RequestInit };
const resp = (status: number, corpo: unknown = '') => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });

describe('armazenamento no Supabase Storage', () => {
  let chamadas: Chamada[]; let respostas: Response[];
  beforeEach(() => {
    chamadas = []; respostas = [];
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co/'); vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_xyz');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => { chamadas.push({ url, init }); return respostas.shift() ?? resp(200); }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('grava sem sobrescrever, no bucket privado, com a chave só no apikey', async () => {
    await gravar('emp-1/arq-1', Buffer.from('conteúdo'));
    const c = chamadas[0]; const h = c.init.headers as Record<string, string>;
    expect(c.url).toBe('https://abc.supabase.co/storage/v1/object/documentos/emp-1/arq-1');
    expect(c.init.method).toBe('POST'); expect(h['x-upsert']).toBe('false'); expect(h.apikey).toBe('sb_secret_xyz'); expect(h.Authorization).toBeUndefined();
    expect(Buffer.from(c.init.body as Uint8Array).toString()).toBe('conteúdo');
  });
  it('chave antiga (JWT service_role) vai também como Bearer', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', 'eyJhbGciOi.x.y');
    await gravar('a/b', Buffer.from('x'));
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe('Bearer eyJhbGciOi.x.y');
  });
  it('falha de gravação (ex.: chave já existe) vira erro', async () => {
    respostas.push(resp(409, '{"error":"Duplicate"}'));
    await expect(gravar('a/b', Buffer.from('x'))).rejects.toThrow(/HTTP 409/);
  });
  it('lê o conteúdo binário', async () => {
    respostas.push(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    expect([...(await ler('a/b'))]).toEqual([1, 2, 3]);
  });
  it('apaga por prefixo exato e tolera 404', async () => {
    respostas.push(resp(404));
    await apagar('informes/e1/u1');
    expect(chamadas[0].init.method).toBe('DELETE'); expect(JSON.parse(chamadas[0].init.body as string)).toEqual({ prefixes: ['informes/e1/u1'] });
  });
  it('recusa chaves com caminho relativo ou caracteres estranhos', async () => {
    for (const k of ['../x', 'a/../b', '/a', 'a//b', 'a b', 'a?b']) await expect(gravar(k, Buffer.from('x'))).rejects.toThrow('chave inválida');
    expect(chamadas).toHaveLength(0);
  });
  it('cria o bucket privado se não existir e recusa bucket público', async () => {
    respostas.push(resp(404), resp(200, { name: 'documentos' }));
    expect(await prepararArmazenamento()).toMatch(/criado/);
    expect(JSON.parse(chamadas[1].init.body as string)).toEqual({ id: 'documentos', name: 'documentos', public: false });
    respostas.push(resp(200, { public: true }));
    await expect(prepararArmazenamento()).rejects.toThrow(/PÚBLICO/);
  });
  it('saúde do armazenamento', async () => {
    respostas.push(resp(200, {})); expect(await armazenamentoOk()).toBe(true);
    respostas.push(resp(401)); expect(await armazenamentoOk()).toBe(false);
  });
});

describe('conexão com o banco na nuvem', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('local sem TLS; nuvem com TLS (verificado só com o certificado)', () => {
    expect(configPg('postgres://u:p@localhost:5432/db').ssl).toBeUndefined();
    const n = configPg('postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require');
    expect(n.ssl).toEqual({ rejectUnauthorized: false }); expect(n.connectionString).not.toContain('sslmode');
    vi.stubEnv('DATABASE_CA_CERT', '-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----');
    expect(configPg('postgresql://u:p@h.supabase.com:5432/postgres').ssl).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----', rejectUnauthorized: true });
  });
  it('URL inválida dá mensagem clara', () => { expect(() => configPg('postgres://u:p@#x@h/db')).toThrow(/letras e números/); });
});

describe('e-mail pela API do Brevo', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('interpreta o remetente', () => {
    expect(remetente('Contvoo Contabilidade <avisos@contvoo.com.br>')).toEqual({ name: 'Contvoo Contabilidade', email: 'avisos@contvoo.com.br' });
    expect(remetente('avisos@contvoo.com.br')).toEqual({ email: 'avisos@contvoo.com.br' });
  });
  it('envia texto puro pela API e propaga falha', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'brevo'); vi.stubEnv('BREVO_API_KEY', 'xkeysib-1'); vi.stubEnv('EMAIL_FROM', '"Contvoo" <avisos@x.com.br>');
    const f = vi.fn(async () => resp(201, { messageId: '1' })); vi.stubGlobal('fetch', f);
    const p = provedorPadrao()!; expect(p.nome).toBe('brevo');
    await p.enviar({ para: 'cliente@y.com', assunto: 'Aviso', texto: 'Olá' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email'); expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-1');
    expect(JSON.parse(init.body as string)).toEqual({ sender: { name: 'Contvoo', email: 'avisos@x.com.br' }, to: [{ email: 'cliente@y.com' }], subject: 'Aviso', textContent: 'Olá' });
    f.mockResolvedValueOnce(resp(401, 'Key not found'));
    await expect(p.enviar({ para: 'a@b.c', assunto: 's', texto: 't' })).rejects.toThrow(/Brevo HTTP 401/);
  });
  it('sem configuração, nenhum provedor', () => { vi.stubEnv('EMAIL_PROVIDER', ''); expect(provedorPadrao()).toBeNull(); });
});
