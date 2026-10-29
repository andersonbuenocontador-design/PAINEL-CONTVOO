import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** Cifra segredos guardados no banco (AES-256-GCM). Chave: APP_ENCRYPTION_KEY (recomendado, ≥32 caracteres); sem ela, deriva da SESSION_SECRET. */
const chave = () => {
  const k = process.env.APP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!k || k.length < 32) throw new Error('APP_ENCRYPTION_KEY (ou SESSION_SECRET) ausente ou curta demais (mín. 32 caracteres)');
  return Buffer.from(hkdfSync('sha256', k, 'painel-contabil', 'segredos-v1', 32));
};
const b64 = (b: Buffer) => b.toString('base64url');
export function cifrar(texto: string): string {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', chave(), iv); const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', b64(iv), b64(c.getAuthTag()), b64(ct)].join('.');
}
export function decifrar(valor: string): string {
  const [v, iv, tag, ct] = valor.split('.'); if (v !== 'v1' || !iv || !tag || !ct) throw new Error('formato inválido');
  const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
