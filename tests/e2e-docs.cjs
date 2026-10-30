const { chromium } = require('playwright'); const fs = require('fs');
const B = 'http://localhost:3100'; const C = '2026-10';
const ok = (c, m) => { console.log(c ? 'OK   ' : 'FALHA', m); if (!c) process.exitCode = 1; };
fs.writeFileSync('/tmp/e2e/ok.pdf', '%PDF-1.4 conteudo de teste'); fs.writeFileSync('/tmp/e2e/ruim.txt', 'texto');
const login = async (p, email, pw) => { await p.goto(B + '/login'); await p.fill('#email', email); await p.fill('#senha', pw); await p.click('button'); };
const trocar = async (p, atual, nova) => { await p.waitForURL('**/trocar-senha'); await p.fill('#atual', atual); await p.fill('#nova', nova); await p.fill('#confirma', nova); await p.click('button'); };
(async () => {
  const br = await chromium.launch();
  const adm = await (await br.newContext()).newPage();
  await login(adm, 'admin@teste.local', 'SenhaDeTeste#2026'); await trocar(adm, 'SenhaDeTeste#2026', 'Troca#Segura2026x'); await adm.waitForURL('**/admin');
  await adm.goto(B + '/admin/empresas'); await adm.fill('input[name=razaoSocial]', 'Empresa Alfa Ltda'); await adm.fill('input[name=cnpj]', '11.222.333/0001-81'); await adm.click('button:has-text("Cadastrar")'); await adm.waitForURL(/ok=/);
  await adm.click('a:has-text("Abrir")'); await adm.waitForURL(/empresas\/[0-9a-f-]{36}$/); const idAlfa = adm.url().split('/').pop();
  await adm.fill('input[name=nome]', 'Cliente Alfa'); await adm.fill('input[name=email]', 'alfa@cliente.com'); await adm.fill('input[name=senha]', 'Provisoria#Sol2026'); await adm.click('button:has-text("Criar usuário")'); await adm.waitForURL(/ok=/);
  // exigência
  await adm.goto(`${B}/admin/empresas/${idAlfa}/documentos?competencia=${C}`);
  await adm.fill('form:has(button:has-text("Adicionar")) input[name=nome]', 'Extrato conta corrente'); await adm.fill('form:has(button:has-text("Adicionar")) input[name=instituicao]', 'Banrisul');
  await adm.click('button:has-text("Adicionar")'); await adm.waitForURL(/ok=/); ok(await adm.locator('text=Extrato conta corrente').count() > 0, 'exigência configurada pelo admin');
  // Beta (outro cliente)
  require('child_process').execSync('cd /home/claude/painel-contabil && npx tsx scripts/e2e-beta.ts', { stdio: 'inherit' });
  // cliente Alfa
  const cli = await (await br.newContext()).newPage();
  await login(cli, 'alfa@cliente.com', 'Provisoria#Sol2026'); await trocar(cli, 'Provisoria#Sol2026', 'Cavalo#Verde2026!'); await cli.waitForURL(/\/cliente\//);
  await cli.goto(`${B}/cliente/${idAlfa}/documentos?competencia=${C}`);
  ok(await cli.locator('span.tag:has-text("Pendente")').count() > 0, 'cliente vê documento pendente');
  await cli.setInputFiles('input[type=file]', '/tmp/e2e/ruim.txt'); await cli.click('button:has-text("Enviar arquivo")'); await cli.waitForURL(/erro=/);
  ok(await cli.locator('.msg-err:has-text("Formato não aceito")').count() > 0, 'formato inválido recusado');
  await cli.setInputFiles('input[type=file]', '/tmp/e2e/ok.pdf'); await cli.click('button:has-text("Enviar arquivo")'); await cli.waitForURL(/ok=/);
  ok(await cli.locator('span.tag:has-text("Enviado")').count() > 0, 'envio do PDF registrado');
  // admin rejeita
  await adm.goto(`${B}/admin/empresas/${idAlfa}/documentos?competencia=${C}`);
  await adm.fill('input[name=motivo]', 'Extrato de setembro'); await adm.click('button:has-text("Rejeitar")'); await adm.waitForURL(/ok=/);
  await cli.goto(`${B}/cliente/${idAlfa}/documentos?competencia=${C}`);
  ok(await cli.locator('text=Motivo: Extrato de setembro').count() > 0, 'cliente vê o motivo da rejeição');
  await cli.setInputFiles('input[type=file]', '/tmp/e2e/ok.pdf'); await cli.click('button:has-text("Enviar novo arquivo")'); await cli.waitForURL(/ok=/);
  ok(await cli.locator('text=v2').count() > 0, 'reenvio cria versão 2');
  // download pelo cliente (com cookie) e sem login
  const href = await cli.locator('a[href^="/api/arquivos/"]').first().getAttribute('href');
  const r = await cli.request.get(B + href); ok(r.status() === 200 && (await r.text()).startsWith('%PDF'), 'cliente baixa o próprio arquivo');
  const anon = await br.newContext(); const ra = await anon.request.get(B + href); ok(ra.status() === 401 || ra.url().includes('/login') || ra.status() === 307 || ra.status() === 200 && ra.url().includes('/login'), 'sem login não baixa (' + ra.status() + ')');
  // cliente Beta não baixa
  const bet = await (await br.newContext()).newPage();
  await login(bet, 'beta@cliente.com', 'Provisoria#Lua2026'); await trocar(bet, 'Provisoria#Lua2026', 'Lua#Azul2026!x'); await bet.waitForURL(/\/cliente\//);
  const rb = await bet.request.get(B + href); ok(rb.status() === 404, 'cliente de outra empresa recebe 404 no download (' + rb.status() + ')');
  const rb2 = await bet.goto(`${B}/cliente/${idAlfa}`); ok(rb2.status() === 404, 'cliente Beta 404 na página da Alfa');
  // aprova
  await adm.goto(`${B}/admin/empresas/${idAlfa}/documentos?competencia=${C}`); await adm.click('button:has-text("Aprovar")'); await adm.waitForURL(/ok=/);
  await cli.goto(`${B}/cliente/${idAlfa}/documentos?competencia=${C}`); ok(await cli.locator('text=competência concluída').count() > 0 && await cli.locator('text=(100%)').count() > 0, 'aprovado: 100% e competência concluída');
  ok(await cli.locator('input[type=file][name=arquivo]').count() === 0, 'cliente não pode reenviar após aprovação');
  await adm.goto(`${B}/admin/entregas?competencia=${C}`); ok(await adm.locator('tr:has-text("Empresa Alfa") td:has-text("100%")').count() > 0, 'visão geral mostra Alfa 100%');
  await adm.goto(`${B}/admin/empresas/${idAlfa}/documentos?competencia=2026-09`); ok(await adm.locator('span.tag:has-text("Pendente")').count() > 0, 'outra competência segue pendente');
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
