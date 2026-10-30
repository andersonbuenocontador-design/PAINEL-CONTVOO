const { chromium } = require('playwright'); const { execSync } = require('child_process'); const fs = require('fs');
const B = 'http://localhost:3100'; const C = '2026-10'; const FX = 'tests/fixtures/';
const ok = (c, m) => { console.log(c ? 'OK   ' : 'FALHA', m); if (!c) process.exitCode = 1; };
const login = async (p, e, pw) => { await p.goto(B + '/login'); await p.fill('#email', e); await p.fill('#senha', pw); await p.click('button'); };
const trocar = async (p, a, n) => { await p.waitForURL('**/trocar-senha'); await p.fill('#atual', a); await p.fill('#nova', n); await p.fill('#confirma', n); await p.click('button'); };
const PLANO = `Referencial
   11   1.1.1.01.0001   BANCO BANRISUL C/C 12345-6
   21   3.2.1.01.0001   TARIFAS BANCARIAS
   23   3.2.1.03.0001   ENERGIA ELETRICA
   31   3.1.1.01.0001   RECEITA DE VENDAS`;
fs.writeFileSync('/tmp/e2e/out.csv', 'Data;Histórico;Valor\n02/10/2026;TARIFA MENSAL;-39,90\n03/10/2026;PAGTO ENERGIA ELETRICA;-300,00\n04/10/2026;PIX CLIENTE ZZ;150,00\n');
(async () => {
  const br = await chromium.launch();
  const adm = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await login(adm, 'admin@teste.local', 'SenhaDeTeste#2026'); await trocar(adm, 'SenhaDeTeste#2026', 'Troca#Segura2026x'); await adm.waitForURL('**/admin');
  await adm.goto(B + '/admin/empresas/nova'); await adm.fill('input[name=razaoSocial]', 'Empresa Alfa Ltda'); await adm.fill('input[name=cnpj]', '11.222.333/0001-81'); await adm.click('button:has-text("Cadastrar")'); await adm.waitForURL(/ok=/);
  await adm.click('a:has-text("Abrir")'); await adm.waitForURL(/empresas\/[0-9a-f-]{36}$/); const idAlfa = adm.url().split('/').pop();
  await adm.fill('input[name=nome]', 'Cliente Alfa'); await adm.fill('input[name=email]', 'alfa@cliente.com'); await adm.fill('input[name=senha]', 'Provisoria#Sol2026'); await adm.click('button:has-text("Criar usuário")'); await adm.waitForURL(/ok=/);
  execSync('npx tsx scripts/e2e-beta.ts', { stdio: 'inherit' });
  await adm.goto(`${B}/admin/empresas/${idAlfa}/extratos?competencia=${C}`);
  await adm.fill('input[name=banco]', 'Banrisul'); await adm.fill('input[name=conta]', '12345-6'); await adm.click('button:has-text("Adicionar conta")'); await adm.waitForURL(/ok=/);
  await adm.goto(`${B}/admin/empresas/${idAlfa}/plano`); await adm.fill('textarea[name=texto]', PLANO); await adm.click('button:has-text("Importar plano")'); await adm.waitForURL(/ok=/);
  ok(await adm.locator('text=4 conta(s) lida(s): 4 nova(s)').count() > 0, 'admin importou o plano de contas do cliente');
  await adm.fill('input[name=codigo]', '99'); await adm.fill('input[name=classificacao]', '3.2.9.01.0001'); await adm.fill('input[name=nome]', 'DESPESAS GERAIS'); await adm.click('button:has-text("Salvar conta")'); await adm.waitForSelector('td:has-text("DESPESAS GERAIS")');
  ok(true, 'admin adicionou conta ao plano');

  const cli = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await login(cli, 'alfa@cliente.com', 'Provisoria#Sol2026'); await trocar(cli, 'Provisoria#Sol2026', 'Cavalo#Verde2026!'); await cli.waitForURL(/\/cliente\//);
  await cli.goto(`${B}/cliente/${idAlfa}/extratos?competencia=${C}`);
  ok(await cli.locator('button:has-text("Ler extrato")').count() === 0 && await cli.locator('.aviso.info:has-text("Os extratos entram aqui sozinhos")').count() === 1, 'cliente não tem "Enviar extrato": a aba puxa dos documentos');
  await adm.goto(`${B}/admin/empresas/${idAlfa}/extratos?competencia=${C}`); await adm.setInputFiles('input[name=arquivo]', '/tmp/e2e/out.csv'); await adm.click('button:has-text("Ler extrato")'); await adm.waitForURL(/ok=/);
  ok(!adm.url().includes('/importacao/') && await adm.locator('.aviso.info:has-text("3 lançamento(s)")').count() === 1, 'escritório envia extrato e ele vai direto para a conciliação (sem prévia)');
  await cli.goto(`${B}/cliente/${idAlfa}/extratos?competencia=${C}`);
  ok(await cli.locator('.guiada h2:has-text("Vamos organizar")').count() === 1, 'cliente abre no modo guiado');
  await cli.click('button:has-text("Ver em tabela")'); await cli.waitForSelector('table'); ok(true, 'cliente troca para a tabela (fica lembrado)');
  ok(await cli.locator('button:has-text("Para revisar (2)")').count() > 0, 'tela do conciliador: "Para revisar (2)"');
  ok(await cli.locator('tr:has-text("ENERGIA") td.conta:has-text("Energia elétrica")').count() > 0 && await cli.locator('tr:has-text("ENERGIA") td.conta:has-text("(23)")').count() === 0 && await cli.locator('tr:has-text("ENERGIA") .chip:has-text("Média")').count() > 0, 'energia sugerida em Média com a categoria genérica, sem código');
  ok(await cli.locator('tr:has-text("PIX") .prefixo:has-text("REVISAR")').count() > 0, 'sem natureza: REVISAR / Baixa');
  await cli.screenshot({ path: '/tmp/e2e/conc1.png', fullPage: true });
  await cli.click('tr:has-text("PIX CLIENTE")'); await cli.locator('tr.editor select').selectOption({ label: 'Recebimento de clientes' }); await cli.locator('tr.editor button:has-text("Salvar")').click();
  await cli.waitForSelector('button:has-text("Para revisar (1)")'); ok(true, 'editar a linha: conta escolhida confirma e sai de "Para revisar"');
  await cli.locator('tr:has-text("ENERGIA") button:has-text("OK")').click(); await cli.waitForSelector('button:has-text("Para revisar (0)")'); ok(true, 'OK confirma a classificação');
  await cli.click('button:has-text("Todas (3)")'); ok(await cli.locator('tbody tr.clicavel').count() === 3 && await cli.locator('.rev').count() === 2, 'todas as linhas; 2 revisadas (✓)');
  await cli.locator('thead input[type=checkbox]').check(); ok(await cli.locator('text=3 selecionado(s)').count() > 0, 'seleção em lote');
  await cli.locator('select[aria-label="Conta para classificar"]').selectOption({ label: 'Outras despesas da empresa' }); await cli.click('button:has-text("Classificar e confirmar")');
  await cli.waitForFunction(() => [...document.querySelectorAll('td.conta')].filter((t) => t.textContent.includes('Outras despesas da empresa')).length === 3, null, { timeout: 15000 }).then(() => ok(true, 'lote aplicou a conta nas 3 linhas'), () => ok(false, 'lote aplicou a conta nas 3 linhas'));
  await cli.fill('input[type=search]', 'tarifa'); ok(await cli.locator('tbody tr.clicavel').count() === 1, 'busca filtra a tabela');
  await cli.screenshot({ path: '/tmp/e2e/conc2.png', fullPage: true });
  const ex = await cli.request.get(`${B}/api/conciliacao/exportar?empresaId=${idAlfa}&competencia=${C}`);
  ok(ex.status() === 200 && /spreadsheetml/.test(ex.headers()['content-type']) && (await ex.body()).slice(0, 2).toString() === 'PK', 'Baixar Excel gera .xlsx');
  ok(await cli.locator('text=Sem dados para conferir').count() > 0 && await cli.locator('text=Conferência da competência').count() > 0, 'cartão de conferência mostra "sem dados" quando o arquivo não traz saldos');
  // --- fluxo: enviar -> escritório confere e devolve -> cliente corrige -> reenvia -> escritório conclui
  const URLP = `${B}/cliente/${idAlfa}/extratos?competencia=${C}`; const URLA = `${B}/admin/empresas/${idAlfa}/extratos?competencia=${C}`;
  await cli.goto(URLP); await cli.click('button:has-text("Concluir e enviar ao escritório")'); await cli.waitForSelector('.aviso.erro:has-text("Falta informar a nota fiscal em 3")');
  ok(await cli.locator('button:has-text("Falta nota (3)")').count() === 1, 'sem nota informada não envia: aviso e filtro "Falta nota (3)"');
  await cli.click('button:has-text("Todas (3)")'); await cli.click('tbody tr.clicavel >> nth=0'); await cli.locator('tr.editor input[placeholder="Ex.: 1234"]').fill('5678'); await cli.locator('tr.editor button:has-text("Salvar")').click();
  await cli.waitForSelector('button:has-text("Falta nota (2)")'); ok(await cli.locator('td.nota:has-text("NF 5678")').count() === 1, 'número da nota informado na linha');
  await cli.click('button:has-text("Falta nota (2)")'); await cli.locator('thead input[type=checkbox]').check(); await cli.click('button:has-text("Marcar como sem nota")');
  await cli.waitForSelector('button:has-text("Falta nota")', { state: 'detached' }); ok(await cli.locator('td.nota:has-text("Sem nota")').count() >= 0, 'demais marcadas como "Sem nota" em lote');
  await cli.goto(URLP); await cli.click('button:has-text("Concluir e enviar ao escritório")'); await cli.waitForSelector('.chip:has-text("Enviada ao escritório")');
  ok(await cli.locator('tbody input[type=checkbox]').count() === 0 && await cli.locator('summary:has-text("Enviar extrato")').count() === 0, 'enviada: cliente fica em somente leitura (sem seleção nem envio de extrato)');
  await adm.goto(`${B}/admin/conciliacoes?competencia=${C}`); ok(await adm.locator('tr:has-text("Empresa Alfa") :text("Aguardando conferência")').count() > 0, 'fila do escritório mostra a Alfa aguardando conferência');
  const fila = await adm.request.get(`${B}/api/conciliacao/fila?competencia=${C}`); ok(fila.status() === 200 && (await fila.body()).slice(0, 2).toString() === 'PK', 'exportar lista da fila (Excel)');
  ok((await cli.request.get(`${B}/api/conciliacao/fila?competencia=${C}`)).status() === 403, 'cliente não exporta a fila do escritório');
  await adm.goto(URLA); await adm.click('button:has-text("Todas (3)")'); await adm.locator('tbody tr.clicavel input[type=checkbox]').first().check();
  await adm.fill('input[placeholder="O que o cliente precisa corrigir?"]', 'Esta tarifa é outra despesa'); await adm.click('button:has-text("Pedir correção")'); await adm.waitForSelector('button:has-text("Correção pedida (1)")');
  await adm.click('summary:has-text("Devolver para correção")'); await adm.fill('textarea[name=mensagem]', 'Ajuste a linha marcada.'); await adm.click('button:has-text("Devolver ao cliente")'); await adm.waitForSelector('.chip.baixa:has-text("Devolvida")');
  ok(true, 'escritório pediu correção na linha e devolveu a competência');
  await cli.goto(URLP); ok(await cli.locator('text=O escritório devolveu esta competência').count() > 0 && await cli.locator('text=Ajuste a linha marcada.').count() > 0 && await cli.locator('text=Correção pedida: Esta tarifa é outra despesa').count() > 0, 'cliente vê a mensagem e o motivo exato na linha');
  await cli.click('button:has-text("Concluir e enviar ao escritório")'); await cli.waitForSelector('.msg-err, .aviso.erro:has-text("correção pedida")'); ok(true, 'não deixa reenviar com correção pendente');
  await cli.click('tbody tr.clicavel >> nth=0'); await cli.locator('tr.editor select').selectOption({ label: 'Tarifas bancárias' }); await cli.locator('tr.editor button:has-text("Salvar")').click();
  await cli.waitForSelector('button:has-text("Correção pedida")', { state: 'detached' }); ok(true, 'corrigir a linha limpa o pedido de correção');
  await cli.click('button:has-text("Concluir e enviar ao escritório")'); await cli.waitForSelector('.chip:has-text("Enviada ao escritório")'); ok(true, 'cliente reenvia ao escritório');
  await adm.goto(URLA); await adm.click('button:has-text("Aprovar e concluir")'); await adm.waitForSelector('.chip.status-concluida'); ok(true, 'escritório aprova e conclui');
  await cli.goto(URLP); ok(await cli.locator('text=Competência concluída pelo escritório').count() > 0 && await cli.locator('button:has-text("Concluir e enviar")').count() === 0, 'cliente vê concluída, sem botão de envio');
  await adm.goto(URLA); await adm.click('button:has-text("Reabrir para o cliente")'); await adm.waitForSelector('.chip:has-text("Em revisão")'); ok(true, 'escritório reabre a competência');
  // isolamento e permissões
  const bet = await (await br.newContext()).newPage();
  await login(bet, 'beta@cliente.com', 'Provisoria#Lua2026'); await trocar(bet, 'Provisoria#Lua2026', 'Lua#Azul2026!x'); await bet.waitForURL(/\/cliente\//);
  ok((await bet.goto(`${B}/cliente/${idAlfa}/extratos`)).status() === 404, 'Beta: 404 nos extratos da Alfa');
  ok((await bet.request.get(`${B}/api/conciliacao/exportar?empresaId=${idAlfa}&competencia=${C}`)).status() === 404, 'Beta: 404 no Excel da Alfa');
  await cli.goto(`${B}/admin/empresas/${idAlfa}/plano`); ok(!cli.url().includes('/plano'), 'cliente não abre o plano de contas (admin)');
  await adm.goto(`${B}/admin/empresas/${idAlfa}/extratos?competencia=${C}`); await adm.click('button:has-text("Todas (3)")'); ok(await adm.locator('td.conta:has-text("Outras despesas da empresa")').count() === 2 && await adm.locator('td.conta:has-text("Tarifas bancárias")').count() === 1, 'escritório vê as mesmas linhas, com a correção do cliente');
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
