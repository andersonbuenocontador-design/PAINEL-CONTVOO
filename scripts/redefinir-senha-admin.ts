// Gera uma NOVA senha temporária para um usuário (padrão: o administrador do .env.local) e exige troca no próximo acesso.
// Uso: npx tsx scripts/redefinir-senha-admin.ts [email]
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const email = (process.argv[2] ?? process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase();
if (!email) { console.error('Informe o e-mail: npx tsx scripts/redefinir-senha-admin.ts email@exemplo.com'); process.exit(1); }
const senha = randomBytes(10).toString('hex');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(
  `UPDATE usuarios SET senha_hash=$2, deve_trocar_senha=true, token_version=token_version+1, falhas_login=0, bloqueado_ate=NULL WHERE lower(email)=$1 AND ativo RETURNING id`,
  [email, await bcrypt.hash(senha, 12)]);
await c.end();
if (!r.rowCount) { console.error(`Nenhum usuário ativo com o e-mail ${email}.`); process.exit(1); }
console.log(`\nUsuário: ${email}\nSENHA TEMPORÁRIA: ${senha}\n(troca obrigatória no próximo acesso; as sessões antigas foram encerradas)\n`);
