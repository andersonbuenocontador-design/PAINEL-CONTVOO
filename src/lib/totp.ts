import { createHmac, randomBytes } from 'node:crypto';

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf: Buffer): string { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += A[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += A[(v << (5 - bits)) & 31]; return out; }
export function debase32(s: string): Buffer { let bits = 0, v = 0; const out: number[] = []; for (const c of s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')) { const i = A.indexOf(c); if (i < 0) throw new Error('base32 inválido'); v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
export const gerarSegredo = () => base32(randomBytes(20));

export function hotp(segredo: string, contador: number, digitos = 6): string {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(contador));
  const h = createHmac('sha1', debase32(segredo)).update(b).digest(); const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digitos).padStart(digitos, '0');
}
export const passoDe = (ms: number) => Math.floor(ms / 1000 / 30);
/** Devolve o passo (janela de 30 s) que casou, ou null. Tolera ±1 passo de relógio. */
export function verificarTotp(segredo: string, codigo: string, agora = Date.now(), janela = 1): number | null {
  const c = String(codigo).replace(/\D/g, ''); if (c.length !== 6) return null; const p0 = passoDe(agora);
  for (let d = -janela; d <= janela; d++) if (hotp(segredo, p0 + d) === c) return p0 + d;
  return null;
}
export const uriOtpauth = (email: string, segredo: string, emissor = 'Contvoo') => `otpauth://totp/${encodeURIComponent(emissor)}:${encodeURIComponent(email)}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
