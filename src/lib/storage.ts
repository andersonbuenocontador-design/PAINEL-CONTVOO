import { mkdir, readFile, unlink, writeFile, access, constants } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Armazenamento PRIVADO dos documentos. Os arquivos só saem por rota autenticada.
// - Nuvem (produção): Supabase Storage, bucket privado, acessado só pelo servidor com a chave secreta (SUPABASE_URL + SUPABASE_SECRET_KEY).
// - Disco (desenvolvimento/testes): pasta STORAGE_DIR, fora de qualquer pasta pública.
const nuvem = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
export const bucket = () => process.env.SUPABASE_BUCKET ?? 'documentos';

const validar = (chave: string) => {
  if (!chave || chave.startsWith('/') || chave.split('/').some((s) => !s || s === '.' || s === '..') || !/^[\w./-]+$/.test(chave)) throw new Error('chave inválida');
  return chave;
};
/** Cabeçalhos da API do Supabase. Chaves novas (sb_secret_...) vão só em `apikey`; a antiga service_role (JWT) vai também como Bearer. */
const LIMITE_MS = 60_000; // nenhuma chamada ao Storage espera mais que isso
export function cabecalhosSupabase(extra: Record<string, string> = {}) {
  const k = process.env.SUPABASE_SECRET_KEY!;
  return { apikey: k, ...(k.startsWith('eyJ') ? { Authorization: `Bearer ${k}` } : {}), ...extra };
}
const urlObjeto = (chave: string) => `${process.env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1/object/${bucket()}/${validar(chave).split('/').map(encodeURIComponent).join('/')}`;
async function falha(r: Response, acao: string): Promise<never> {
  const corpo = (await r.text().catch(() => '')).slice(0, 200);
  throw new Error(`armazenamento (${acao}): HTTP ${r.status} ${corpo}`);
}

const raiz = () => resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? join(process.cwd(), 'storage'));
const seguro = (chave: string) => {
  const p = resolve(raiz(), chave);
  if (!p.startsWith(raiz() + '/')) throw new Error('chave inválida');
  return p;
};

/** Grava um arquivo novo; falha se a chave já existir (nunca sobrescreve). */
export async function gravar(chave: string, dados: Buffer) {
  if (!nuvem()) { const p = seguro(chave); await mkdir(dirname(p), { recursive: true }); await writeFile(p, dados, { flag: 'wx' }); return; }
  const r = await fetch(urlObjeto(chave), { signal: AbortSignal.timeout(LIMITE_MS), method: 'POST', headers: cabecalhosSupabase({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }), body: new Uint8Array(dados) });
  if (!r.ok) await falha(r, 'gravar');
}
export async function ler(chave: string): Promise<Buffer> {
  if (!nuvem()) return readFile(seguro(chave));
  const r = await fetch(urlObjeto(chave), { signal: AbortSignal.timeout(LIMITE_MS), headers: cabecalhosSupabase() });
  if (!r.ok) await falha(r, 'ler');
  return Buffer.from(await r.arrayBuffer());
}
export async function apagar(chave: string) {
  if (!nuvem()) { try { await unlink(seguro(chave)); } catch (e: any) { if (e?.code !== 'ENOENT') throw e; } return; }
  const r = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1/object/${bucket()}`, {
    signal: AbortSignal.timeout(LIMITE_MS), method: 'DELETE', headers: cabecalhosSupabase({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [validar(chave)] }) });
  if (!r.ok && r.status !== 404) await falha(r, 'apagar');
}
/** Para /api/saude e `npm run verificar`: o armazenamento responde e aceita escrita? */
export async function armazenamentoOk(): Promise<boolean> {
  try {
    if (!nuvem()) { await mkdir(raiz(), { recursive: true }); await access(raiz(), constants.W_OK); return true; }
    const r = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1/bucket/${bucket()}`, { signal: AbortSignal.timeout(LIMITE_MS), headers: cabecalhosSupabase() });
    return r.ok;
  } catch { return false; }
}
/** Cria o bucket PRIVADO se ainda não existir (chamado pelo `npm run migrate`). */
export async function prepararArmazenamento() {
  if (!nuvem()) return 'disco';
  const base = process.env.SUPABASE_URL!.replace(/\/$/, '');
  const r = await fetch(`${base}/storage/v1/bucket/${bucket()}`, { signal: AbortSignal.timeout(LIMITE_MS), headers: cabecalhosSupabase() });
  if (r.ok) {
    const b = await r.json();
    if (b.public) throw new Error(`o bucket "${bucket()}" está PÚBLICO no Supabase: deixe-o privado (Storage → bucket → Edit → desmarque Public)`);
    return 'nuvem';
  }
  const c = await fetch(`${base}/storage/v1/bucket`, { signal: AbortSignal.timeout(LIMITE_MS), method: 'POST', headers: cabecalhosSupabase({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: bucket(), name: bucket(), public: false }) });
  if (!c.ok) await falha(c, 'criar bucket');
  return 'nuvem (bucket criado)';
}
