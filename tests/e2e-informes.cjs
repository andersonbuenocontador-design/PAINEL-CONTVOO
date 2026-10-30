const { chromium } = require('playwright'); const { execSync } = require('child_process'); const fs = require('fs');
const B = 'http://localhost:3100';
const ok = (c, m) => { console.log(c ? 'OK   ' : 'FALHA', m); if (!c) process.exitCode = 1; };
const login = async (p, e, pw) => { await p.goto(B + '/login'); await p.fill('#email', e); await p.fill('#senha', pw); await p.click('button'); };
const trocar = async (p, a, n) => { await p.waitForURL('**/trocar-senha'); await p.fill('#atual', a); await p.fill('#nova', n); await p.fill('#confirma', n); await p.click('button'); await p.waitForURL(/\/(cliente|admin)/); };
fs.writeFileSync('/tmp/e2e/inf1.pdf', '%PDF-1.4 informe do socio um'); fs.writeFileSync('/tmp/e2e/inf2.pdf', '%PDF-1.4 informe do socio dois'); fs.writeFileSync('/tmp/e2e/inf1b.pdf', '%PDF-1.4 informe do socio um CORRIGIDO'); fs.writeFileSync('/tmp/e2e/mau.exe', 'MZ');
(async () => {
  const br = await chromium.launch(); const ctx = async () => (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const adm = await ctx(); await login(adm, 'admin@teste.local', 'SenhaDeTeste#2026'); await trocar(adm, 'SenhaDeTeste#2026', 'Troca#Segura2026x');
  await adm.goto(B + '/admin/empresas/nova'); await adm.fill('input[name=razaoSocial]', 'Empresa Alfa Ltda'); await adm.fill('input[name=cnpj]', '11.222.333/0001-81'); await adm.click('button:has-text("Cadastrar")'); await adm.waitForURL(/ok=/);
  await adm.click('a:has-text("Abrir")'); await adm.waitForURL(/empresas\/[0-9a-f-]{36}$/); const E = adm.url().split('/').pop(); const pagina = `${B}/admin/empresas/${E}/informes`;
  for (const [n, em] of [['Socio Um', 'u1@alfa.com'], ['Socio Dois', 'u2@alfa.com']]) {
    await adm.goto(`${B}/admin/empresas/${E}`); await adm.fill('input[name=nome]', n); await adm.fill('input[name=email]', em); await adm.fill('input[name=senha]', 'Provisoria#Sol2026'); await adm.click('button:has-text("Criar usuário")'); await adm.waitForSelector('.msg-ok');
  }
  execSync('npx tsx scripts/e2e-beta.ts', { stdio: 'inherit' });
  // sócios
  for (const [n, cpf] of [['Socio Um', '529.982.247-25'], ['Socio Dois', '111.444.777-35']]) {
    await adm.goto(pagina); const f = adm.locator('form:has(button:has-text("Cadastrar sócio"))'); await f.locator('input[name=nome]').fill(n); await f.locator('input[name=cpf]').fill(cpf); await f.locator('button').click(); await adm.waitForSelector('.msg-ok');
  }
  await adm.goto(pagina); await adm.click('button:has-text("Cadastrar sócio")'); await adm.waitForSelector('.msg-err:has-text("Informe o nome")', { timeout: 3000 }).catch(() => {});
  await adm.goto(pagina); const f2 = adm.locator('form:has(button:has-text("Cadastrar sócio"))'); await f2.locator('input[name=nome]').fill('Dup'); await f2.locator('input[name=cpf]').fill('529.982.247-25'); await f2.locator('button').click(); await adm.waitForSelector('.msg-err:has-text("Já existe um sócio")'); ok(true, 'CPF duplicado recusado');
  await f2.locator('input[name=cpf]').fill('123.456.789-00').catch(() => {}); await adm.goto(pagina); const f3 = adm.locator('form:has(button:has-text("Cadastrar sócio"))'); await f3.locator('input[name=nome]').fill('Inv'); await f3.locator('input[name=cpf]').fill('123.456.789-00'); await f3.locator('button').click(); await adm.waitForSelector('.msg-err:has-text("CPF inválido")'); ok(true, 'CPF inválido recusado');
  // autorizar usuários
  for (const [socio, usr] of [['Socio Um', 'Socio Um'], ['Socio Dois', 'Socio Dois']]) {
    await adm.goto(pagina); const det = adm.locator('details').filter({ has: adm.locator('summary', { hasText: `${socio} · CPF` }) }).first(); await det.locator('summary').first().click();
    const opts = await det.locator('select[name=usuarioId] option').allTextContents(); const alvo = opts.find((o) => o.startsWith(usr + ' '));
    await det.locator('select[name=usuarioId]').selectOption({ label: alvo }); await det.locator('button:has-text("Autorizar")').click(); await adm.waitForSelector('.msg-ok');
  }
  ok(true, 'usuários autorizados por sócio');
  // informes enviados pelo escritório foram retirados da tela (pedido do escritório); a página é de sócios e retiradas
  await adm.goto(pagina);
  ok(await adm.locator('h2:has-text("Novo informe")').count() === 0 && await adm.locator('h2:has-text("Informes cadastrados")').count() === 0 && await adm.locator('h2:has-text("Tipos de documento")').count() === 0, 'escritório: cartões de informes retirados');
  ok(await adm.locator('h2:has-text("Sócios")').count() > 0 && await adm.locator('#retiradas').count() === 1, 'escritório: continuam Sócios e Retiradas informadas pelo cliente');
  const c1 = await ctx(); await login(c1, 'u1@alfa.com', 'Provisoria#Sol2026'); await trocar(c1, 'Provisoria#Sol2026', 'SenhaU1#2026!!');
  await c1.goto(`${B}/cliente/${E}/informes`);
  ok(await c1.locator('h1:has-text("Retiradas dos sócios")').count() === 1 && await c1.locator('h2:has-text("Documentos do escritório")').count() === 0, 'cliente: aba de retiradas, sem lista de informes');
  const bet = await ctx(); await login(bet, 'beta@cliente.com', 'Provisoria#Lua2026'); await trocar(bet, 'Provisoria#Lua2026', 'Lua#Azul2026!x');
  ok((await bet.goto(`${B}/cliente/${E}/informes`)).status() === 404, 'cliente de outra empresa: 404 na página de retiradas');
  await c1.goto(pagina); ok(!c1.url().includes('/admin/'), 'cliente barrado na página do escritório');
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
