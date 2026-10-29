import { existsSync, accessSync, constants, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { configPg } from '../src/lib/db';
import { armazenamentoOk, bucket } from '../src/lib/storage';

// Uso: npm run verificar            (avisos não derrubam)
//      npm run verificar -- --producao   (exige HTTPS, 2FA dos admins, chave de cifra própria etc.)
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const prod = process.argv.includes('--producao');
let erros = 0, avisos = 0;
const ok = (m: string) => console.log(`  ✔ ${m}`);
const aviso = (m: string, grave = false) => { if (grave && prod) { erros++; console.log(`  ✖ ${m}`); } else { avisos++; console.log(`  ⚠ ${m}`); } };
const erro = (m: string) => { erros++; console.log(`  ✖ ${m}`); };
const e = process.env;

console.log(`\nVerificação do ambiente (${prod ? 'PRODUÇÃO' : 'desenvolvimento'})\n`);
Number(process.versions.node.split('.')[0]) >= 20 ? ok(`Node ${process.versions.node}`) : erro(`Node ${process.versions.node}: use 20 ou superior`);
if (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32) erro('SESSION_SECRET ausente ou com menos de 32 caracteres (gere com: openssl rand -base64 48)'); else if (/troque|exemplo|changeme|teste/i.test(e.SESSION_SECRET)) aviso('SESSION_SECRET parece um valor de exemplo', true); else ok('SESSION_SECRET definido');
if (!e.APP_ENCRYPTION_KEY) aviso('APP_ENCRYPTION_KEY ausente: o segredo do 2FA será cifrado com uma chave derivada da SESSION_SECRET. Defina uma chave própria (mín. 32 caracteres) e guarde-a junto dos backups', true);
else if (e.APP_ENCRYPTION_KEY.length < 32) erro('APP_ENCRYPTION_KEY com menos de 32 caracteres'); else if (e.APP_ENCRYPTION_KEY === e.SESSION_SECRET) aviso('APP_ENCRYPTION_KEY igual à SESSION_SECRET: use valores diferentes', true); else ok('APP_ENCRYPTION_KEY definida');
if (!e.APP_URL) aviso('APP_URL ausente (links dos e-mails ficam sem endereço)', true); else if (!/^https:\/\//.test(e.APP_URL)) aviso(`APP_URL não é HTTPS (${e.APP_URL}): em produção o painel só deve ser servido por HTTPS`, true); else ok(`APP_URL ${e.APP_URL}`);
e.EXIGIR_2FA_ADMIN === '1' ? ok('2FA obrigatório para administradores') : aviso('EXIGIR_2FA_ADMIN=1 não definido: administradores podem entrar sem 2º fator', true);
e.TRUST_PROXY === '1' ? ok('TRUST_PROXY=1 (limite de tentativas por IP ativo; o proxy reverso precisa sobrescrever X-Forwarded-For)') : aviso('TRUST_PROXY não definido: sem limite de tentativas por IP (só por conta). Defina TRUST_PROXY=1 atrás de UM proxy reverso confiável');
if (e.EMAIL_PROVIDER === 'smtp' && e.SMTP_URL && e.EMAIL_FROM) ok('e-mail (SMTP) configurado'); else if (e.EMAIL_PROVIDER === 'brevo' && e.BREVO_API_KEY && e.EMAIL_FROM) ok('e-mail (Brevo) configurado'); else aviso('e-mail não configurado: os avisos ficam na fila');
if (!e.CRON_SECRET || e.CRON_SECRET.length < 24) aviso('CRON_SECRET ausente/curto (<24): o agendador não conseguirá chamar /api/notificacoes/processar'); else ok('CRON_SECRET definido');
const anos = Number(e.RETENCAO_ANOS ?? 5); Number.isInteger(anos) && anos >= 1 ? ok(`retenção: ${anos} ano(s) (confirme o prazo com o jurídico/encarregado)`) : erro('RETENCAO_ANOS inválido');
if (e.SUPABASE_URL || e.SUPABASE_SECRET_KEY) {
  if (!e.SUPABASE_URL || !e.SUPABASE_SECRET_KEY) erro('defina SUPABASE_URL e SUPABASE_SECRET_KEY juntas');
  else (await armazenamentoOk()) ? ok(`armazenamento na nuvem: bucket "${bucket()}" acessível`) : erro(`armazenamento na nuvem inacessível (bucket "${bucket()}" existe? rode npm run migrate; chave secreta correta?)`);
} else {
  const storage = resolve(e.STORAGE_DIR ?? join(process.cwd(), 'storage'));
  if (prod) aviso(`documentos em disco local (${storage}): em servidor sem disco permanente (Render grátis) eles se perdem; configure SUPABASE_URL e SUPABASE_SECRET_KEY`, true);
  try { mkdirSync(storage, { recursive: true }); accessSync(storage, constants.W_OK); ok(`armazenamento gravável: ${storage}`); if (storage.startsWith(resolve('public'))) erro('STORAGE_DIR está dentro de public/: os arquivos ficariam expostos'); } catch { erro(`armazenamento sem permissão de escrita: ${storage}`); }
}
if (e.DATABASE_URL && !/@(localhost|127\.0\.0\.1)[:/]/.test(e.DATABASE_URL) && e.DATABASE_SSL !== '0') e.DATABASE_CA_CERT ? ok('banco na nuvem com TLS e certificado verificado') : aviso('banco na nuvem com TLS, mas sem verificar o certificado (defina DATABASE_CA_CERT com o certificado do Supabase para verificar)');
if (!e.DATABASE_URL) erro('DATABASE_URL ausente');
else {
  const c = new pg.Client(configPg(e.DATABASE_URL));
  try {
    await c.connect(); ok('conexão com o banco');
    const feitas = new Set((await c.query('SELECT nome FROM _migracoes').catch(() => ({ rows: [] as { nome: string }[] }))).rows.map((r) => r.nome));
    const todas = readdirSync('migrations').filter((f) => f.endsWith('.sql')); const falta = todas.filter((f) => !feitas.has(f));
    falta.length ? erro(`${falta.length} migração(ões) pendente(s): ${falta.join(', ')} (rode npm run migrate)`) : ok(`migrações em dia (${todas.length})`);
    if (!falta.length) {
      const adm = (await c.query(`SELECT count(*)::int n, count(*) FILTER (WHERE mfa_ativo)::int mfa FROM usuarios WHERE papel='admin' AND ativo`)).rows[0];
      adm.n ? ok(`${adm.n} administrador(es) ativo(s), ${adm.mfa} com 2FA`) : erro('nenhum administrador ativo (rode npm run seed)');
      if (adm.n && e.EXIGIR_2FA_ADMIN === '1' && adm.mfa < adm.n) aviso('há administrador sem 2FA: ele será levado a configurar no próximo acesso');
    }
  } catch (x) { erro(`banco inacessível: ${(x as Error).message.replace(/\/\/[^@\s]*@/, '//***@')}`); } finally { await c.end().catch(() => {}); }
}
if (existsSync('.gitignore') && !/\.env\.local/.test(readFileSync('.gitignore', 'utf8'))) erro('.env.local não está no .gitignore');
console.log(`\n${erros ? '✖' : avisos ? '⚠' : '✔'} ${erros} erro(s), ${avisos} aviso(s)\n`);
process.exit(erros ? 1 : 0);
