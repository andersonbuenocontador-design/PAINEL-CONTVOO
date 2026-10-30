import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Esconde senhas e chaves em mensagens de erro. */
export const mascarar = (m: string) => m.replace(/\/\/[^@\s/]*@/g, '//***@').replace(/sb_secret_[\w-]+/g, 'sb_secret_***').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***');

/** Traduz erros de configuração da nuvem (banco/armazenamento) para uma frase que o dono do sistema consegue corrigir. Nunca inclui senhas. */
export function diagnosticar(e: unknown, onde: 'banco' | 'armazenamento' | 'admin' | 'inicio' = 'inicio'): string {
  const err = e as { code?: string; message?: string; cause?: { code?: string } };
  const msg = String(err?.message ?? e); const code = err?.code ?? err?.cause?.code ?? '';
  if (/DATABASE_URL não configurada/.test(msg)) return 'banco: falta DATABASE_URL no Render (Environment).';
  if (/DATABASE_URL inválida/.test(msg)) return 'banco: ' + msg;
  if (/\[?YOUR-PASSWORD\]?/i.test(process.env.DATABASE_URL ?? '')) return 'banco: o DATABASE_URL ainda tem [YOUR-PASSWORD]; troque pela senha do banco (sem colchetes).';
  if (/db\.[a-z0-9]+\.supabase\.co/.test(process.env.DATABASE_URL ?? '') && (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENOTFOUND' || /ENETUNREACH|EHOSTUNREACH/.test(msg)))
    return 'banco: o DATABASE_URL é a "Direct connection" (db.xxx.supabase.co), que não funciona no Render. No Supabase use Connect → Session pooler.';
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'banco: senha recusada. Confira a senha no DATABASE_URL (no Supabase: Project Settings → Database → Reset database password, se precisar).';
  if (/Tenant or user not found/i.test(msg)) return 'banco: usuário ou projeto não encontrado no pooler. Copie de novo a URI do Session pooler (o usuário é postgres.xxxx).';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `${onde}: endereço não encontrado. Copie de novo do Supabase o ${onde === 'armazenamento' ? 'SUPABASE_URL' : 'DATABASE_URL'}.`;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /timeout/i.test(msg)) return `${onde}: sem resposta do servidor. Confira o endereço/porta (Session pooler usa a porta 5432) e se o projeto do Supabase não está pausado.`;
  if (/HTTP (401|403)/.test(msg) || /Invalid (API )?key|signature/i.test(msg)) return 'armazenamento: SUPABASE_SECRET_KEY recusada. Copie a chave secreta (sb_secret_...) em Project Settings → API Keys.';
  if (/PÚBLICO/.test(msg)) return 'armazenamento: ' + msg;
  if (/chave PÚBLICA/.test(msg)) return msg.replace(/^armazenamento \([^)]*\): /, 'armazenamento: ');
  if (/row-level security/i.test(msg)) return 'armazenamento: o Supabase recusou a gravação (permissão). Confira se a SUPABASE_SECRET_KEY no Render é a chave SECRETA (sb_secret_... ou service_role), não a pública.';
  if (/SEED_ADMIN/.test(msg)) return 'admin: ' + msg;
  return `${onde}: ${mascarar(msg).slice(0, 200)}`;
}

const arquivo = () => join(process.cwd(), '.diagnostico-inicio.json');
/** Problema registrado por scripts/iniciar-nuvem.ts (migração/armazenamento/admin), se houver. */
export function problemaNoInicio(): string | null {
  try { return existsSync(arquivo()) ? (JSON.parse(readFileSync(arquivo(), 'utf8')).problema ?? null) : null; } catch { return null; }
}
export const caminhoDiagnostico = arquivo;

/** Explica, sem mostrar valores, o que há de errado com variáveis obrigatórias: ausente, vazia, curta ou com nome digitado diferente. */
export function conferirVariaveis(nomes: { nome: string; min?: number }[]): string[] {
  const out: string[] = [];
  for (const { nome, min } of nomes) {
    const v = process.env[nome];
    if (v === undefined) {
      const parecida = Object.keys(process.env).find((k) => k !== nome && k.trim().replace(/[\s-]/g, '_').toUpperCase() === nome);
      out.push(parecida ? `${nome} está cadastrada com o nome diferente "${parecida}" (confira espaços/maiúsculas)` : `${nome} não está cadastrada`);
    } else if (!v.trim()) out.push(`${nome} está vazia`);
    else if (v !== v.trim()) out.push(`${nome} tem espaço no começo ou no fim do valor`);
    else if (min && v.length < min) out.push(`${nome} tem ${v.length} caractere(s); precisa de ${min} ou mais`);
  }
  return out;
}
