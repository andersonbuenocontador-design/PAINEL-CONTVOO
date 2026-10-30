const { chromium } = require('playwright');
const B = 'http://localhost:3100';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA'), m); if (!c) process.exitCode = 1; };
(async () => {
  const br = await chromium.launch();
  const adm = await (await br.newContext()).newPage();
  await adm.goto(B + '/admin'); ok(adm.url().includes('/login'), 'sem sessão -> /login');
  await adm.fill('#email', 'admin@teste.local'); await adm.fill('#senha', 'SenhaDeTeste#2026'); await adm.click('button');
  await adm.waitForURL('**/trocar-senha'); ok(true, 'admin obrigado a trocar a senha');
  await adm.fill('#atual', 'SenhaDeTeste#2026'); await adm.fill('#nova', 'Troca#Segura2026x'); await adm.fill('#confirma', 'Troca#Segura2026x'); await adm.click('button');
  await adm.waitForURL('**/admin'); ok(true, 'troca de senha concluída');
  await adm.goto(B + '/admin/empresas');
  const emp = async (rz, cnpj) => { await adm.goto(B + '/admin/empresas/nova'); await adm.fill('input[name=razaoSocial]', rz); await adm.fill('input[name=cnpj]', cnpj); await adm.click('text=Cadastrar'); await adm.waitForURL(/[?&](erro|ok)=/); };
  await emp('Empresa Alfa Ltda', '11.222.333/0001-81');
  ok(await adm.locator('text=Empresa cadastrada.').count() > 0, 'empresa Alfa cadastrada');
  await emp('Empresa Beta Ltda', '11.222.333/0001-82');
  ok(await adm.locator('text=CNPJ inválido.').count() > 0, 'CNPJ inválido rejeitado na tela');
  await emp('Empresa Beta Ltda', '45.723.174/0001-10');
  await emp('Empresa Alfa Dup', '11222333000181');
  ok(await adm.locator('text=Já existe uma empresa').count() > 0, 'CNPJ duplicado rejeitado');
  // cria usuário cliente da Alfa
  await adm.goto(B + '/admin/empresas'); await adm.click('a:has-text("Abrir") >> nth=0'); await adm.waitForLoadState('networkidle');
  const urlAlfa = adm.url();
  await adm.fill('input[name=nome]', 'Cliente Alfa'); await adm.fill('input[name=email]', 'alfa@cliente.com'); await adm.fill('input[name=senha]', 'Provisoria#Sol2026'); await adm.click('button:has-text("Criar usuário")'); await adm.waitForURL(/[?&](erro|ok)=/);
  ok(await adm.locator('text=Usuário criado').count() > 0, 'usuário cliente criado e vinculado à Alfa');
  // id da Beta
  await adm.goto(B + '/admin/empresas'); const hrefs = await adm.locator('a:has-text("Abrir")').evaluateAll(a => a.map(x => x.getAttribute('href')));
  const idBeta = hrefs.find(h => !urlAlfa.endsWith(h));
  // cliente
  const cli = await (await br.newContext()).newPage();
  await cli.goto(B + '/login'); await cli.fill('#email', 'alfa@cliente.com'); await cli.fill('#senha', 'Provisoria#Sol2026'); await cli.click('button');
  await cli.waitForURL('**/trocar-senha'); await cli.fill('#atual', 'Provisoria#Sol2026'); await cli.fill('#nova', 'Cavalo#Verde2026!'); await cli.fill('#confirma', 'Cavalo#Verde2026!'); await cli.click('button');
  await cli.waitForURL(/\/cliente\/[0-9a-f-]{36}/); ok(await cli.locator('h1:has-text("Empresa Alfa Ltda")').count() > 0 && await cli.locator('text=Empresa Beta').count() === 0, 'cliente vê somente a Alfa');
  const r1 = await cli.goto(B + '/cliente/' + idBeta.split('/').pop()); ok(r1.status() === 404, 'cliente -> empresa Beta = 404 (' + r1.status() + ')');
  const r2 = await cli.goto(B + idBeta); ok(!(await cli.url()).includes('/admin/empresas/') , 'cliente barrado em /admin (' + cli.url() + ')');
  await cli.goto(B + '/admin/auditoria'); ok(!cli.url().includes('/admin/auditoria'), 'cliente não vê auditoria');
  // admin bloqueia cliente -> sessão do cliente cai
  await adm.goto(B + '/admin/usuarios');
  const linha = adm.locator('tr', { hasText: 'alfa@cliente.com' }); await linha.locator('button:has-text("Bloquear")').click(); await adm.waitForURL(/[?&]ok=/);
  await cli.goto(B + '/cliente'); ok(cli.url().includes('/login'), 'cliente bloqueado perde a sessão imediatamente');
  await adm.goto(B + '/admin/auditoria'); ok(new URL(adm.url()).pathname === '/admin', 'painel de auditoria retirado da tela');
  ok(require('child_process').execSync(`PGPASSWORD=painel_dev psql -q -t -A -h localhost -U painel painel -c "select count(*) from auditoria where acao='usuario.bloquear'"`).toString().trim() !== '0', 'auditoria continua registrando (bloqueio gravado no banco)');
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
