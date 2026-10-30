import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { configPg } from '../src/lib/db';
import { prepararArmazenamento } from '../src/lib/storage';
import { garantirPlanoGenerico } from '../src/lib/services/conciliacao';

export async function migrate(url = process.env.DATABASE_URL) {
  const c = new pg.Client(configPg(url));
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
    await protegerApiSupabase(c);
    await garantirPlanoGenerico(c); // plano genérico de categorias em todas as empresas (idempotente)
  } finally { await c.end(); }
}

/** No Supabase, o esquema public fica exposto pela API automática (PostgREST) aos papéis anon/authenticated.
 *  O painel não usa essa API: liga RLS sem políticas (nega tudo) e retira as permissões desses papéis.
 *  O usuário do painel é o dono das tabelas e não é afetado. Idempotente; fora do Supabase não faz nada. */
export async function protegerApiSupabase(c: pg.Client) {
  await c.query(`DO $$ DECLARE t text; BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN RETURN; END IF;
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END $$`);
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  migrate().then(prepararArmazenamento).then((a) => console.log('armazenamento:', a)).catch((e) => { console.error(e); process.exit(1); });
}
