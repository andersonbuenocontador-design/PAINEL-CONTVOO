import { existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { configPg } from '../src/lib/db';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: senha, DATABASE_URL } = process.env;
if (process.argv.includes('--se-configurado') && !email && !senha) process.exit(0); // no início do servidor: só cria se as variáveis existirem
if (!email || !senha || senha.length < 10) { console.error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mín. 10 caracteres).'); process.exit(1); }
const c = new pg.Client(configPg(DATABASE_URL));
await c.connect();
const r = await c.query(
  `INSERT INTO usuarios(nome,email,senha_hash,papel,deve_trocar_senha) VALUES ('Administrador',$1,$2,'admin',true) ON CONFLICT DO NOTHING RETURNING id`,
  [email.toLowerCase(), await bcrypt.hash(senha, 12)]);
console.log(r.rowCount ? 'Administrador criado (será exigida troca de senha no primeiro acesso).' : 'Administrador já existe; nada alterado.');
await c.end();
