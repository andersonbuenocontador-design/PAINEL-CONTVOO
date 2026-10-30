// Preparação antes de ligar o site na nuvem: migrações, bucket privado e 1º administrador.
// Se algo falhar (configuração errada), registra o motivo em .diagnostico-inicio.json e o site liga mesmo assim,
// mostrando o problema em /api/saude — em vez de o Render só dizer "Failed" sem explicação.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { configPg } from '../src/lib/db';
import { prepararArmazenamento } from '../src/lib/storage';
import { caminhoDiagnostico, diagnosticar } from '../src/lib/diagnostico';
import { migrate } from './migrate';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const problemas: string[] = [];
rmSync(caminhoDiagnostico(), { force: true });
let bancoOk = false;
try { await migrate(); bancoOk = true; console.log('banco: migrações em dia'); } catch (e) { problemas.push(diagnosticar(e, 'banco')); }
try { console.log('armazenamento:', await prepararArmazenamento()); } catch (e) { problemas.push(diagnosticar(e, 'armazenamento')); }
const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: senha } = process.env;
if (bancoOk && (email || senha)) {
  try {
    if (!email || !senha || senha.length < 10) throw new Error('SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mín. 10 caracteres) precisam estar preenchidos no Render.');
    const c = new pg.Client(configPg()); await c.connect();
    try {
      const r = await c.query(`INSERT INTO usuarios(nome,email,senha_hash,papel,deve_trocar_senha) VALUES ('Administrador',$1,$2,'admin',true) ON CONFLICT DO NOTHING RETURNING id`,
        [email.toLowerCase(), await bcrypt.hash(senha, 12)]);
      if (r.rowCount) console.log('admin: criado (troca de senha no 1º acesso)');
      else if (process.env.REDEFINIR_SENHA_ADMIN === '1') {
        // Recuperação sem acesso ao servidor: grava SEED_ADMIN_PASSWORD como nova senha provisória (troca obrigatória) e encerra as sessões.
        const u = await c.query(`UPDATE usuarios SET senha_hash=$2, deve_trocar_senha=true, token_version=token_version+1, falhas_login=0, bloqueado_ate=NULL
          WHERE lower(email)=$1 AND papel='admin' RETURNING id`, [email.toLowerCase(), await bcrypt.hash(senha, 12)]);
        if (!u.rowCount) throw new Error(`SEED_ADMIN_EMAIL ${email} não é um administrador cadastrado.`);
        await c.query(`INSERT INTO auditoria(usuario_id,acao,entidade,entidade_id,detalhes) VALUES (NULL,'senha_admin_redefinida_no_inicio','usuario',$1,'{}')`, [u.rows[0].id]).catch(() => {});
        console.log('admin: senha redefinida (troca no próximo acesso). Apague REDEFINIR_SENHA_ADMIN e SEED_ADMIN_PASSWORD no Render.');
      } else console.log('admin: já existe');
    } finally { await c.end(); }
  } catch (e) { problemas.push(diagnosticar(e, 'admin')); }
}
if (problemas.length) {
  writeFileSync(caminhoDiagnostico(), JSON.stringify({ problema: problemas.join(' | '), em: new Date().toISOString() }));
  console.error('PROBLEMA DE CONFIGURAÇÃO:', problemas.join(' | '));
}
