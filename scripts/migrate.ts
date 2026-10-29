import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export async function migrate(url = process.env.DATABASE_URL) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS _migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT nome FROM _migracoes')).rows.map((r) => r.nome));
    const dir = join(process.cwd(), 'migrations');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(readFileSync(join(dir, f), 'utf8'));
        await c.query('INSERT INTO _migracoes(nome) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
        await c.query('COMMIT');
        console.log('aplicada:', f);
      } catch (e) { await c.query('ROLLBACK'); throw e; }
    }
  } finally { await c.end(); }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  migrate().catch((e) => { console.error(e); process.exit(1); });
}
