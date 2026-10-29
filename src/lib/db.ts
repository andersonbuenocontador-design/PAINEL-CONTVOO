import pg from 'pg';

const g = globalThis as unknown as { __pool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!g.__pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
    g.__pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
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
