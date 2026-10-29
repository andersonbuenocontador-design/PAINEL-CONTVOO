// Copia os documentos entre o Supabase Storage (bucket privado) e uma pasta local. Usado pelo backup e pela restauração na nuvem.
// Uso: npx tsx scripts/documentos-nuvem.ts baixar <pasta>   |   npx tsx scripts/documentos-nuvem.ts enviar <pasta>
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { bucket, cabecalhosSupabase, gravar, ler } from '../src/lib/storage';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const [acao, pasta] = process.argv.slice(2);
if (!['baixar', 'enviar'].includes(acao) || !pasta) { console.error('Uso: documentos-nuvem.ts baixar|enviar <pasta>'); process.exit(1); }
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) { console.error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY'); process.exit(1); }

/** Lista recursiva: no Storage, "pastas" vêm com id nulo. */
export async function listar(prefixo = ''): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1/object/list/${bucket()}`, {
      method: 'POST', headers: cabecalhosSupabase({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: prefixo, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) });
    if (!r.ok) throw new Error(`listar ${prefixo}: HTTP ${r.status} ${await r.text()}`);
    const itens = (await r.json()) as { name: string; id: string | null }[];
    for (const i of itens) {
      if (i.name === '.emptyFolderPlaceholder') continue;
      if (i.id === null) out.push(...(await listar(`${prefixo}${i.name}/`))); else out.push(`${prefixo}${i.name}`);
    }
    if (itens.length < 1000) return out;
  }
}
const locais = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? locais(p) : [p]; });

if (acao === 'baixar') {
  const chaves = await listar();
  for (const k of chaves) { const p = join(pasta, ...k.split('/')); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, await ler(k)); }
  console.log(`${chaves.length} documento(s) baixado(s) para ${pasta}`);
} else {
  const arqs = existsSync(pasta) ? locais(pasta) : [];
  for (const p of arqs) await gravar(relative(pasta, p).split(sep).join('/'), readFileSync(p));
  console.log(`${arqs.length} documento(s) enviado(s) para o bucket "${bucket()}"`);
}
