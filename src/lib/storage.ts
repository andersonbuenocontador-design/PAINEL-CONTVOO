import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Armazenamento PRIVADO em disco fora de qualquer pasta pública. Os arquivos só saem por rota autenticada.
// Interface mínima para trocar por S3 compatível depois.
const raiz = () => resolve(process.env.STORAGE_DIR ?? join(process.cwd(), 'storage'));
const seguro = (chave: string) => {
  const p = resolve(raiz(), chave);
  if (!p.startsWith(raiz() + '/')) throw new Error('chave inválida');
  return p;
};
export async function gravar(chave: string, dados: Buffer) { const p = seguro(chave); await mkdir(dirname(p), { recursive: true }); await writeFile(p, dados, { flag: 'wx' }); }
export async function ler(chave: string) { return readFile(seguro(chave)); }
export async function apagar(chave: string) { try { await unlink(seguro(chave)); } catch (e: any) { if (e?.code !== 'ENOENT') throw e; } }
