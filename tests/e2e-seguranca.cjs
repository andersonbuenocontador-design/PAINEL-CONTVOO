const { chromium } = require('playwright'); const crypto = require('crypto');
const B = 'http://localhost:3100';
const ok = (c, m) => { console.log(c ? 'OK   ' : 'FALHA', m); if (!c) process.exitCode = 1; };
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const deb32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (seg, passo) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(passo)); const h = crypto.createHmac('sha1', deb32(seg)).update(b).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const agora = () => Math.floor(Date.now() / 30000);
(async () => {
  const br = await chromium.launch(); const nova = async () => (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const p = await nova();
  const resp = await p.goto(B + '/login'); const h = resp.headers();
  ok(/frame-ancestors 'none'/.test(h['content-security-policy'] || '') && /max-age/.test(h['strict-transport-security'] || '') && h['x-frame-options'] === 'DENY' && h['x-content-type-options'] === 'nosniff' && !h['x-powered-by'], 'cabeçalhos de segurança (CSP, HSTS, X-Frame, nosniff) presentes');
  const erros = []; p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) erros.push(m.text()); });
  await p.fill('#email', 'admin@teste.local'); await p.fill('#senha', 'SenhaDeTeste#2026'); await p.click('button'); await p.waitForURL('**/trocar-senha');
  await p.fill('#atual', 'SenhaDeTeste#2026'); await p.fill('#nova', '1234567890'); await p.fill('#confirma', '1234567890'); await p.click('button'); await p.waitForSelector('.msg-err:has-text("muito comum")'); ok(true, 'senha fraca recusada na troca');
  await p.fill('#atual', 'SenhaDeTeste#2026'); await p.fill('#nova', 'Troca#Segura2026x'); await p.fill('#confirma', 'Troca#Segura2026x'); await p.click('button'); await p.waitForURL('**/admin');
  ok(erros.length === 0, 'páginas funcionam sob a CSP (sem violações)' + (erros.length ? ' ' + erros[0] : ''));
  // 2FA: configurar
  await p.goto(B + '/conta/seguranca'); await p.click('button:has-text("Configurar")'); await p.waitForSelector('svg'); const seg = (await p.locator('code').innerText()).trim();
  ok(/^[A-Z2-7]{32}$/.test(seg) && await p.locator('svg').count() > 0, 'QR code e chave manual exibidos');
  await p.fill('#codigo', '000000'); await p.click('button:has-text("Ativar")'); await p.waitForSelector('.msg-err:has-text("Código incorreto")'); ok(true, 'código errado recusado na ativação');
  await p.fill('#codigo', totp(seg, agora())); await p.click('button:has-text("Ativar")'); await p.waitForSelector('pre'); const codigos = (await p.locator('pre').innerText()).trim().split('\n');
  ok(codigos.length === 8 && codigos.every((c) => /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(c)), '2FA ativado com 8 códigos de recuperação');
  // novo login exige 2º fator
  const q = await nova(); await q.goto(B + '/login'); await q.fill('#email', 'admin@teste.local'); await q.fill('#senha', 'Troca#Segura2026x'); await q.click('button'); await q.waitForURL('**/login/verificar');
  ok(true, 'login com senha correta pede o 2º fator');
  ok((await q.goto(B + '/admin')) && q.url().includes('/login') && !q.url().includes('/admin'), 'sem concluir o 2º fator não há sessão (/admin redireciona)');
  await q.goto(B + '/login/verificar'); await q.fill('#codigo', '123456'); await q.click('button'); await q.waitForSelector('.msg-err:has-text("Código inválido")'); ok(true, 'código errado recusado no login');
  await q.fill('#codigo', totp(seg, agora() + 1)); await q.click('button'); await q.waitForURL('**/admin'); ok(true, 'código do app aceito: sessão aberta');
  // recuperação
  const r = await nova(); await r.goto(B + '/login'); await r.fill('#email', 'admin@teste.local'); await r.fill('#senha', 'Troca#Segura2026x'); await r.click('button'); await r.waitForURL('**/login/verificar');
  await r.fill('#codigo', codigos[0]); await r.click('button'); await r.waitForURL('**/admin'); ok(true, 'código de recuperação abre a sessão');
  const s = await nova(); await s.goto(B + '/login'); await s.fill('#email', 'admin@teste.local'); await s.fill('#senha', 'Troca#Segura2026x'); await s.click('button'); await s.waitForURL('**/login/verificar');
  await s.fill('#codigo', codigos[0]); await s.click('button'); await s.waitForSelector('.msg-err:has-text("Código inválido")'); ok(true, 'código de recuperação não funciona duas vezes');
  // token do 2º fator pendente não vale como sessão
  const ck = (await s.context().cookies()).find((c) => c.name === 'painel_mfa'); const t = await nova(); await t.context().addCookies([{ name: 'painel_sessao', value: ck.value, domain: 'localhost', path: '/' }]); await t.goto(B + '/admin'); ok(t.url().includes('/login'), 'cookie do 2º fator pendente copiado como sessão é recusado');
  // admin redefine 2FA de outro usuário (cria um cliente com 2FA via SQL não é preciso: testa botão aparece só para quem tem 2FA)
  await p.goto(B + '/admin/usuarios'); ok(await p.locator('tr:has-text("admin@teste.local") button:has-text("Redefinir 2FA")').count() > 0, 'tela de usuários oferece "Redefinir 2FA" a quem tem a proteção ativa');
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
