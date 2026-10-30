import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apagar, armazenamentoOk, gravar, ler, prepararArmazenamento, tipoChaveSupabase } from '../src/lib/storage';
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
    expect(n.ssl).toEqual({ rejectUnauthorized: false }); expect(n.connectionTimeoutMillis).toBe(15000); expect(n.connectionString).not.toContain('sslmode');
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

describe('conferência das variáveis (sem mostrar valores)', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('aponta ausente, vazia, curta, espaço e nome parecido', async () => {
    const { conferirVariaveis } = await import('../src/lib/diagnostico');
    vi.stubEnv('V_VAZIA', ''); vi.stubEnv('V_CURTA', 'abc'); vi.stubEnv('V_ESPACO', ' valor '); vi.stubEnv('v_parecida ', 'x'); vi.stubEnv('V_OK', 'segredo-bem-longo');
    const r = conferirVariaveis([{ nome: 'V_AUSENTE' }, { nome: 'V_VAZIA' }, { nome: 'V_CURTA', min: 10 }, { nome: 'V_ESPACO' }, { nome: 'V_PARECIDA' }, { nome: 'V_OK', min: 10 }]);
    expect(r).toEqual(['V_AUSENTE não está cadastrada', 'V_VAZIA está vazia', 'V_CURTA tem 3 caractere(s); precisa de 10 ou mais', 'V_ESPACO tem espaço no começo ou no fim do valor', 'V_PARECIDA está cadastrada com o nome diferente "v_parecida " (confira espaços/maiúsculas)']);
    expect(r.join(' ')).not.toContain('segredo');
  });
});

describe('saudação pelo horário de Brasília', () => {
  it('bom dia (5h–11h59), boa tarde (12h–17h59), boa noite (18h–4h59)', async () => {
    const { saudacaoDoHorario } = await import('../src/lib/format');
    const em = (horaBrasilia: number) => saudacaoDoHorario(new Date(Date.UTC(2026, 9, 30, horaBrasilia + 3, 0)));
    expect([em(5), em(8), em(11)]).toEqual(['Bom dia', 'Bom dia', 'Bom dia']);
    expect([em(12), em(15), em(17)]).toEqual(['Boa tarde', 'Boa tarde', 'Boa tarde']);
    expect([em(18), em(20), em(-1), em(1), em(4)]).toEqual(['Boa noite', 'Boa noite', 'Boa noite', 'Boa noite', 'Boa noite']);
  });
});

describe('chave do Supabase colada errada', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.assinatura`;
  it('reconhece secreta e pública sem mostrar o valor', () => {
    expect(tipoChaveSupabase('sb_secret_abc')).toBe('secreta'); expect(tipoChaveSupabase('sb_publishable_abc')).toBe('publica');
    expect(tipoChaveSupabase(jwt('service_role'))).toBe('secreta'); expect(tipoChaveSupabase(jwt('anon'))).toBe('publica'); expect(tipoChaveSupabase('xyz')).toBe('desconhecida');
  });
  it('recusa por permissão com chave pública vira instrução clara', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co'); vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_publishable_xyz');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}', { status: 400 })));
    await expect(gravar('a/b', Buffer.from('x'))).rejects.toThrow(/chave PÚBLICA/);
    await expect(gravar('a/b', Buffer.from('x'))).rejects.not.toThrow(/sb_publishable_xyz/);
  });
});
