import pg from 'pg';

const g = globalThis as unknown as { __pool?: pg.Pool };

const local = (host: string) => ['localhost', '127.0.0.1', '::1', ''].includes(host);
/** Conexão a partir da URL. Banco na nuvem (ex.: Supabase) exige TLS: com DATABASE_CA_CERT (PEM) o certificado é verificado;
 *  sem ele, a conexão é cifrada mas sem verificar quem responde (aviso no `npm run verificar`). */
export function configPg(url = process.env.DATABASE_URL): pg.ClientConfig {
  if (!url) throw new Error('DATABASE_URL não configurada');
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('DATABASE_URL inválida (se a senha do banco tiver símbolos como @ # / ?, troque por uma só com letras e números)'); }
  if (local(u.hostname) || process.env.DATABASE_SSL === '0') return { connectionString: url };
  u.searchParams.delete('sslmode'); // o sslmode da URL sobrescreveria a configuração abaixo
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return { connectionString: u.toString(), ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } };
}

export function getPool(): pg.Pool {
  if (!g.__pool) g.__pool = new pg.Pool({ ...configPg(), max: Number(process.env.DB_POOL_MAX ?? 10) });
  return g.__pool;
}

export const query = <T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) =>
  getPool().query<T>(text, params);

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
