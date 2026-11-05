// Grava os vídeos do manual (Playwright + legendas e cursor desenhados na tela). Dados fictícios: veja semear.ts.
// Pré-requisito: site em http://localhost:3100 com o banco recém-semeado (scripts/videos/semear.ts).
// GRAVAR=0 faz um ensaio rápido (sem pausas nem vídeo) para depurar as cenas.  Uso: node scripts/videos/gravar.cjs [cena ...]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = process.env.SITE ?? 'http://localhost:3100'; const DADOS = process.env.DADOS_VIDEOS ?? '/tmp/videos-dados';
const RAW = process.env.RAW_VIDEOS ?? '/tmp/videos-raw'; const FINAL = process.env.FINAL_VIDEOS ?? path.join(__dirname, '../../public/ajuda-videos');
const GRAVAR = process.env.GRAVAR !== '0'; const SO = process.argv.slice(2);
const { A, B: EMP_B, saldoFinal } = JSON.parse(fs.readFileSync(`${DADOS}/ids.json`, 'utf8'));
const C = '2026-10'; const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(FINAL, { recursive: true });

const INIT = `(() => {
  const estilo = \`#__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:28px;height:28px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
  .__rip{position:fixed;z-index:2147483646;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:4px solid #ff6b00;pointer-events:none;animation:__r .7s ease-out forwards}
  @keyframes __r{to{transform:scale(4.5);opacity:0}}
  #__leg{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);max-width:88%;z-index:2147483645;background:rgba(11,42,74,.95);color:#fff;font:600 23px/1.35 system-ui,Segoe UI,sans-serif;padding:12px 24px;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.4);text-align:center;pointer-events:none}
  #__leg small{display:block;font:600 14px system-ui;letter-spacing:.08em;text-transform:uppercase;opacity:.75;margin-bottom:3px}
  #__tit{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(135deg,#0b2a4a,#1f6feb);color:#fff;display:grid;place-content:center;text-align:center;font:700 46px/1.2 system-ui,Segoe UI,sans-serif;padding:40px;gap:14px}
  #__tit small{font:500 24px system-ui;opacity:.85}\`;
  const leg = () => { const t = sessionStorage.getItem('__leg'); let e = document.getElementById('__leg'); if (!t) { if (e) e.remove(); return; } if (!e) { e = document.createElement('div'); e.id = '__leg'; document.documentElement.appendChild(e); } e.innerHTML = t; };
  window.__leg = leg;
  const montar = () => {
    if (document.getElementById('__cur')) return;
    const s = document.createElement('style'); s.textContent = estilo; document.documentElement.appendChild(s);
    const c = document.createElement('div'); c.id = '__cur'; c.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 2l7.5 19 2.7-7.8L21 10.5z" fill="#111" stroke="#fff" stroke-width="1.6"/></svg>';
    c.style.transform = 'translate(' + (sessionStorage.getItem('__x') || -60) + 'px,' + (sessionStorage.getItem('__y') || -60) + 'px)'; document.documentElement.appendChild(c); leg();
  };
  document.addEventListener('mousemove', (e) => { const c = document.getElementById('__cur'); if (c) c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; sessionStorage.setItem('__x', e.clientX); sessionStorage.setItem('__y', e.clientY); }, true);
  document.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 800); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();`;

const pausa = (ms) => (GRAVAR ? new Promise((r) => setTimeout(r, ms)) : new Promise((r) => setTimeout(r, 120)));
let passo = 0;
async function legenda(p, texto) {
  const html = texto ? `<small>Passo ${++passo}</small>${texto}` : '';
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  await p.evaluate((h) => { if (h) sessionStorage.setItem('__leg', h); else sessionStorage.removeItem('__leg'); window.__leg && window.__leg(); }, html);
  await pausa(texto ? 1800 + Math.min(texto.length * 28, 2600) : 0);
}
async function titulo(p, t, sub) {
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  await p.evaluate(([t, s]) => { const d = document.createElement('div'); d.id = '__tit'; d.innerHTML = t + '<small>' + s + '</small>'; document.documentElement.appendChild(d); }, [t, sub]);
  await pausa(3200);
  await p.evaluate(() => document.getElementById('__tit')?.remove());
}
async function mover(p, loc) {
  const l = typeof loc === 'string' ? p.locator(loc).first() : loc;
  await l.waitFor({ state: 'visible', timeout: 15000 }); await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox(); if (!b) return l;
  await p.mouse.move(b.x + Math.min(b.width / 2, 120), b.y + b.height / 2, { steps: GRAVAR ? 28 : 1 });
  return l;
}
async function clicar(p, loc, antes = 450) { const l = await mover(p, loc); await pausa(antes); await l.click(); await pausa(500); return l; }
async function digitar(p, loc, texto) { const l = await mover(p, loc); await l.click(); await l.pressSequentially(texto, { delay: GRAVAR ? 65 : 0 }); await pausa(400); }
async function arquivo(p, loc, caminho) { const l = await mover(p, loc); await pausa(400); const [fc] = await Promise.all([p.waitForEvent('filechooser'), l.click()]); await fc.setFiles(caminho); await pausa(900); }
async function esperar(p, ms = 450) { await p.waitForTimeout(GRAVAR ? ms + 150 : ms); }
async function ir(p, url) { await p.goto(B + url); await p.waitForLoadState('domcontentloaded'); await pausa(500); }

let br; const ESTADO = {};
async function cena(nome, estado, fn, salvarEstado) {
  if (SO.length && !SO.includes(nome)) return;
  passo = 0; const t0 = Date.now(); console.log('>>', nome);
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true, storageState: estado ? ESTADO[estado] : undefined,
    recordVideo: GRAVAR ? { dir: RAW, size: { width: 1280, height: 720 } } : undefined });
  await ctx.addInitScript(INIT); const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  let erro = null; try { await fn(p, ctx); await legenda(p, ''); await pausa(1200); } catch (e) { erro = e; console.log('  ERRO em', nome, '-', String(e.message).split('\n').slice(0, 3).join(' | ')); try { await p.screenshot({ path: `${RAW}/erro-${nome}.png` }); } catch {} }
  if (salvarEstado) { ESTADO[salvarEstado] = `${RAW}/estado-${salvarEstado}.json`; await ctx.storageState({ path: ESTADO[salvarEstado] }); }
  const v = p.video(); await ctx.close();
  if (GRAVAR && v && !erro) {
    const webm = `${RAW}/${nome}.webm`; await v.saveAs(webm); await v.delete().catch(() => {});
    execSync(`ffmpeg -y -loglevel error -i ${webm} -vf "fps=15,scale=1280:720" -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart ${FINAL}/${nome}.mp4`);
    execSync(`ffmpeg -y -loglevel error -ss 4 -i ${FINAL}/${nome}.mp4 -frames:v 1 -vf scale=640:-2 -q:v 4 ${FINAL}/${nome}.jpg`);
    const dur = Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${FINAL}/${nome}.mp4`).toString());
    const arqDur = `${FINAL}/duracoes.json`; const durs = fs.existsSync(arqDur) ? JSON.parse(fs.readFileSync(arqDur, 'utf8')) : {}; durs[nome] = Math.round(dur); fs.writeFileSync(arqDur, JSON.stringify(durs, null, 1)); console.log(`   ${nome}.mp4  ${Math.round(dur)}s  ${(fs.statSync(`${FINAL}/${nome}.mp4`).size / 1048576).toFixed(1)} MB`);
  }
  if (erro) process.exitCode = 1; console.log(`   (${Math.round((Date.now() - t0) / 1000)}s)`);
}
const card = (p, titulo) => p.locator(`a.atalho:has-text("${titulo}")`).first();
const anotar = async (p, legendaTxt, alvo) => { if (alvo) await mover(p, alvo); await legenda(p, legendaTxt); };

(async () => {
  br = await chromium.launch();
  // --- preparação invisível: o escritório troca a senha provisória e salva a sessão
  { const ctx = await br.newContext({ locale: 'pt-BR' }); const p = await ctx.newPage();
    await p.goto(B + '/login'); await p.fill('#email', 'admin@teste.local'); await p.fill('#senha', 'SenhaDeTeste#2026'); await p.click('form button');
    await p.waitForURL('**/trocar-senha'); await p.fill('#atual', 'SenhaDeTeste#2026'); await p.fill('#nova', 'Troca#Segura2026x'); await p.fill('#confirma', 'Troca#Segura2026x'); await p.click('form button'); await p.waitForURL('**/admin');
    ESTADO.admin = `${RAW}/estado-admin.json`; await ctx.storageState({ path: ESTADO.admin }); await ctx.close(); }

  // ======================= CLIENTE =======================
  await cena('c1-primeiro-acesso', null, async (p) => {
    await p.goto(B + '/login'); await titulo(p, 'Primeiro acesso', 'Como entrar no Painel do Cliente');
    await legenda(p, 'Entre com o e-mail e a senha provisória que o escritório enviou para você');
    await digitar(p, '#email', 'maria@exemplo.com'); await digitar(p, '#senha', 'Provisoria#Sol2026'); await clicar(p, 'form button');
    await p.waitForURL('**/trocar-senha');
    await legenda(p, 'No primeiro acesso você cria a sua própria senha. Use letras, números e símbolos');
    await digitar(p, '#atual', 'Provisoria#Sol2026'); await digitar(p, '#nova', 'Cavalo#Verde2026!'); await digitar(p, '#confirma', 'Cavalo#Verde2026!'); await clicar(p, 'form button');
    await p.waitForURL(/\/cliente/); await p.waitForLoadState('domcontentloaded'); await pausa(800);
    await anotar(p, 'Esta é a tela inicial. Cada cartão é uma tarefa do mês', card(p, 'Documentos do mês'));
    await anotar(p, 'Documentos do mês: envie os documentos que o escritório pediu', card(p, 'Documentos do mês'));
    await anotar(p, 'Extratos e conciliação: identifique as entradas e saídas do banco', card(p, 'Extratos'));
    await anotar(p, 'Retiradas dos sócios: informe a distribuição de lucros', card(p, 'Retiradas'));
    await anotar(p, 'Pendências: pedidos do escritório para você responder', card(p, 'Pendências'));
    await anotar(p, 'Troque o mês aqui. O escritório trabalha por competência (mês de referência)', p.locator('.comp-mini select'));
    await anotar(p, 'Precisa de ajuda? Os vídeos ficam sempre no link "Ajuda" do topo', p.locator('header.top a:has-text("Ajuda")'));
  }, 'cliente');

  await cena('c2-documentos', 'cliente', async (p) => {
    await ir(p, `/cliente/${A}`); await titulo(p, 'Documentos do mês', 'Enviar, trocar e excluir arquivos');
    await legenda(p, 'Na tela inicial, abra o cartão "Documentos do mês"'); await clicar(p, card(p, 'Documentos do mês')); await p.waitForURL(/documentos/);
    await legenda(p, 'Primeiro escolha o mês de referência: o mês que o escritório está pedindo');
    await mover(p, p.locator('.comp-mini select')); await p.locator('.comp-mini select').selectOption(C); await pausa(500); await clicar(p, p.locator('.comp-mini button')); await p.waitForURL(/competencia=2026-10/);
    await anotar(p, 'Cada documento pedido aparece num cartão com a situação: Pendente, Enviado, Aprovado ou Recusado', p.locator('li.doc-item').first());
    const nota = p.locator('li.doc-item:has-text("Notas fiscais")');
    await legenda(p, 'Para enviar: clique em "Escolher arquivo" e selecione o documento no seu computador');
    await arquivo(p, nota.locator('input[type=file]'), `${DADOS}/nota-fiscal.pdf`);
    await legenda(p, 'Depois clique em "Enviar arquivo"'); await clicar(p, nota.locator('button')); await p.waitForURL(/ok=/);
    await anotar(p, 'Pronto! O documento ficou "Enviado". O escritório será avisado', p.locator('li.doc-item:has-text("Notas fiscais") .tag').first());
    await legenda(p, 'Enviou o arquivo errado? Enquanto o escritório não conferiu, clique em "Excluir"');
    p.once('dialog', (d) => d.accept()); await clicar(p, p.locator('li.doc-item:has-text("Notas fiscais") .excluir-arquivo button')); await p.waitForURL(/ok=/);
    await legenda(p, 'O documento voltou para "Pendente". É só enviar o arquivo certo');
    await arquivo(p, nota.locator('input[type=file]'), `${DADOS}/nota-fiscal.pdf`); await clicar(p, nota.locator('button')); await p.waitForURL(/ok=/);
    await anotar(p, 'Outros documentos: notas, recibos, contratos e guias. Podem ser vários PDFs de uma vez', p.locator('#outros'));
    await arquivo(p, p.locator('#outros input[type=file]').first(), `${DADOS}/comprovante.pdf`);
    await digitar(p, p.locator('#outros input[name=descricao]'), 'Recibo de pagamento');
    await legenda(p, 'Clique em "Enviar PDF". Atenção: arquivos aqui NÃO vão para a conciliação do banco');
    await clicar(p, p.locator('#outros button:has-text("Enviar PDF")')); await p.waitForURL(/ok=/);
    await anotar(p, 'Enquanto o escritório não abrir o arquivo, você pode retirá-lo com o botão "Retirar"', p.locator('.avulsos li button:has-text("Retirar")').first());
  });

  await cena('c3-contvoo-ai', 'cliente', async (p) => {
    await ir(p, `/cliente/${A}/documentos?competencia=${C}`); await titulo(p, 'Extrato do banco e Contvoo AI', 'Como classificar as entradas e saídas');
    const ext = p.locator('li.doc-item:has-text("Extrato")');
    await anotar(p, 'Para a conciliação, envie o extrato do banco aqui, no documento "Extrato" (PDF ou OFX)', ext);
    await arquivo(p, ext.locator('input[type=file]'), `${DADOS}/extrato-outubro.ofx`); await clicar(p, ext.locator('button')); await p.waitForURL(/extratos/);
    await p.waitForSelector('.guiada'); await pausa(800);
    await anotar(p, 'Os lançamentos do extrato entram sozinhos. O Contvoo AI vai perguntar um de cada vez', p.locator('.guiada h2'));
    await anotar(p, 'A barra mostra quanto falta. Cada resposta é salva na hora: você pode parar e voltar depois', p.locator('.progresso'));
    let feitos = 0, vistoSem = false, vistoPart = false, vistoNota = 0, alterou = false;
    for (let i = 0; i < 80 && feitos < 8; i++) {
      await esperar(p, 500);
      if (await p.locator('.part-passo').count()) {
        if (!vistoPart) { vistoPart = true; await anotar(p, 'Pagamento a fornecedor ou recebimento de cliente: informe quem é. O nome já vem do extrato', p.locator('.part-passo')); }
        const novo = p.locator('.part-passo .participante-novo button:has-text("Cadastrar")');
        if (await novo.count()) { if (vistoPart && feitos === 0) await legenda(p, 'Clique em "Cadastrar" (o botão + também cadastra outros nomes)'); await clicar(p, novo); }
        else await clicar(p, p.locator('.part-passo button:has-text("Confirmar")'));
      } else if (await p.locator('.nota-passo').count()) {
        vistoNota++;
        if (vistoNota === 1) { await legenda(p, 'Agora a nota fiscal: digite o número e aperte Enter'); await digitar(p, p.locator('.nota-input'), '1234'); await p.keyboard.press('Enter'); }
        else if (vistoNota === 2) { await legenda(p, 'Não tem nota fiscal? Clique em "Sem nota" (ou aperte a tecla S)'); await clicar(p, p.locator('.nota-passo button:has-text("Sem nota")')); }
        else if (vistoNota === 3) { await legenda(p, 'Dá para anexar o comprovante (foto ou PDF da nota ou boleto) no próprio lançamento'); await arquivo(p, p.locator('.nota-passo label.anexar'), `${DADOS}/comprovante.pdf`); await p.keyboard.press('Escape'); await clicar(p, p.locator('.nota-passo button:has-text("Sem nota")')); }
        else { await p.locator('.nota-input').blur().catch(() => {}); await p.keyboard.press('s'); }
        feitos++; await esperar(p, 600);
      } else if (await p.locator('.sugestao').count()) {
        if (feitos === 0) { await anotar(p, 'O Contvoo AI sugere a categoria. Se estiver certo, clique em "Confirmar"', p.locator('.sugestao')); await clicar(p, p.locator('.sugestao button:has-text("Confirmar")')); }
        else if (feitos === 3 && !alterou) { alterou = true; await anotar(p, 'Sugestão errada? Clique em "Alterar" e escolha a categoria certa', p.locator('.sugestao')); await clicar(p, p.locator('.sugestao button:has-text("Alterar")')); await legenda(p, 'Use os botões rápidos (ou as teclas 1 a 6) ou a lista completa'); await clicar(p, p.locator('.rapidas button.rapida:not(.nao-sei)').first()); }
        else { if (feitos === 1) await legenda(p, 'Dica de velocidade: aperte Enter para confirmar a sugestão'); await p.keyboard.press('Enter'); }
      } else if (await p.locator('.cartao-guiado .rapidas').count()) {
        if (!vistoSem) { vistoSem = true; await anotar(p, 'Sem sugestão? Escolha nos botões. Não sabe o que é? Clique em "Não sei identificar" e o escritório revisa', p.locator('.rapidas')); await clicar(p, p.locator('.rapidas button.nao-sei')); }
        else await clicar(p, p.locator('.rapidas button.rapida:not(.nao-sei)').first(), 250);
      } else if (await p.locator('.cartao-guiado.fim, .cartao-guiado.pausa').count()) break;
    }
    await anotar(p, 'Continue até a barra chegar a 100%. Se preferir uma tabela, clique em "Ver em tabela"', p.locator('.progresso'));
  });
  if (!SO.length || SO.includes('c3-contvoo-ai') || SO.includes('c4-tabela-e-envio')) execSync('npx tsx scripts/videos/completar.ts', { stdio: 'inherit', cwd: path.join(__dirname, '../..') });

  await cena('c4-tabela-e-envio', 'cliente', async (p) => {
    await ir(p, `/cliente/${A}/extratos?competencia=${C}`); await titulo(p, 'Tabela, saldo e envio ao escritório', 'Como terminar a conciliação do mês');
    if (await p.locator('button:has-text("Ver em tabela")').count()) { await legenda(p, 'Para ver todos os lançamentos juntos, clique em "Ver em tabela"'); await clicar(p, p.locator('button:has-text("Ver em tabela")')); }
    await p.waitForSelector('table'); await legenda(p, 'Aqui estão os lançamentos do extrato. Use os filtros e a busca para encontrar o que precisa');
    await clicar(p, p.locator('button.chip:has-text("Todas")')); await digitar(p, p.locator('input[type=search]'), 'sol nascente'); await pausa(900); await p.locator('input[type=search]').fill('');
    await anotar(p, 'Falta algum dado? O filtro "Para revisar" mostra o que ainda precisa da sua atenção', p.locator('button.chip:has-text("Para revisar")'));
    await clicar(p, p.locator('button.chip:has-text("Para revisar")'));
    const linha = p.locator('tbody tr.clicavel:has(.prefixo)').first(); await legenda(p, 'Clique numa linha para escolher a categoria, o fornecedor ou cliente (botão +) e a nota fiscal');
    await clicar(p, linha); await p.waitForSelector('tr.editor');
    const sel = p.locator('tr.editor select[aria-label="Categoria"]'); await mover(p, sel);
    const valor = await sel.evaluate((s) => [...s.options].find((o) => /^Outra/.test(o.textContent))?.value); await sel.selectOption(valor); await pausa(700);
    await legenda(p, 'Marque "Sem nota" se não houver nota fiscal, ou digite o número'); await clicar(p, p.locator('tr.editor .dica input[type=checkbox]'));
    await legenda(p, 'Precisa anexar o comprovante? Clique em "Anexar comprovante"'); await arquivo(p, p.locator('tr.editor .comprovantes label.anexar'), `${DADOS}/comprovante.pdf`);
    await clicar(p, p.locator('tr.editor button:has-text("Salvar")')); await esperar(p, 900);
    await legenda(p, 'Várias linhas sem nota? Use o filtro "Falta nota", marque todas na caixinha do alto e clique em "Marcar como sem nota"');
    if (await p.locator('button.chip:has-text("Falta nota")').count()) {
      await clicar(p, p.locator('button.chip:has-text("Falta nota")')); await clicar(p, p.locator('thead input[type=checkbox]')); await clicar(p, p.locator('button:has-text("Marcar como sem nota")')); await esperar(p, 900);
    }
    if (!/\(0\)/.test(await p.locator('button.chip:has-text("Para revisar")').textContent())) {
      await legenda(p, 'Linhas que já estão certas: filtro "Para revisar", marque todas e clique em "Confirmar (OK) como está"');
      await clicar(p, p.locator('button.chip:has-text("Para revisar")')); await clicar(p, p.locator('thead input[type=checkbox]'));
      await clicar(p, p.locator('button:has-text("Confirmar (OK) como está")')); await esperar(p, 900);
    }
    await clicar(p, p.locator('button.chip:has-text("Todas")'));
    await anotar(p, 'Lançamento que não é da empresa? Use a lixeira da linha e confirme', p.locator('tbody tr.clicavel .excluir-linha').first());
    await p.locator('.banco').first().scrollIntoViewIfNeeded().catch(() => {});
    await anotar(p, 'No cartão do banco, informe o "Saldo anterior" (o saldo do começo do mês, que está no extrato)', p.locator('.saldo-form input[name=saldo]').first());
    await digitar(p, p.locator('.saldo-form input[name=saldo]').first(), brl(8450)); await clicar(p, p.locator('.saldo-form button').first()); await p.waitForURL(/ok=/);
    await anotar(p, `"Ficou no banco" mostra quanto sobrou: R$ ${brl(saldoFinal)}. Deve ser igual ao saldo final do extrato`, p.locator('.ficou').first());
    await legenda(p, 'Tudo classificado e com nota? Clique em "Concluir e enviar ao escritório"');
    await clicar(p, p.locator('.cab button:has-text("Concluir e enviar ao escritório")')); await p.waitForSelector('.chip:has-text("Enviada ao escritório")');
    await anotar(p, 'Enviado! Agora é com o escritório. Se algo precisar de ajuste, ele devolve para você corrigir', p.locator('.chip:has-text("Enviada ao escritório")'));
  });

  await cena('c5-retiradas-lucros', 'cliente', async (p) => {
    await ir(p, `/cliente/${A}`); await titulo(p, 'Distribuição de lucros', 'Informe as retiradas dos sócios');
    await legenda(p, 'Abra o cartão "Retiradas dos sócios"'); await clicar(p, card(p, 'Retiradas')); await p.waitForURL(/informes/);
    await anotar(p, 'Leia o aviso: acima de R$ 50.000,00 por mês há retenção de 10% de imposto. Fale com o escritório antes', p.locator('.aviso-lucros'));
    await mover(p, p.locator('#competencia')); await p.locator('#competencia').selectOption(C); await clicar(p, p.locator('form button:has-text("Ver")').first()); await p.waitForURL(/competencia=2026-10/);
    await legenda(p, 'Informe a data, o sócio e o valor da distribuição de lucros');
    await mover(p, '#data'); await p.fill('#data', '2026-10-15'); await pausa(500);
    await digitar(p, '#socio', 'Maria Exemplo'); await digitar(p, '#valor', '5.000,00'); await digitar(p, '#observacao', 'PIX conta pessoal');
    await clicar(p, p.locator('button:has-text("Lançar retirada")')); await p.waitForURL(/ok=/);
    await anotar(p, 'A retirada entrou na lista. Lançou errado? Use o botão "Excluir" da linha', p.locator('tbody tr:has(td:has-text("Maria Exemplo"))').first());
    await legenda(p, 'Quando terminar, clique em "Enviar ao escritório". Se não houve retiradas, use "Não houve retiradas"');
    await clicar(p, p.locator('button:has-text("Enviar ao escritório")')); await p.waitForURL(/ok=/);
    await anotar(p, 'Enviado. Você ainda pode baixar uma planilha Excel com as retiradas', p.locator('a:has-text("Baixar Excel")'));
  });

  await cena('c6-pendencias-e-noite', 'cliente', async (p) => {
    await ir(p, `/cliente/${A}`); await titulo(p, 'Pendências e modo noite', 'Responder o escritório e deixar a tela escura');
    await anotar(p, 'Quando o escritório precisa de algo, aparece este aviso na tela inicial', p.locator('.msg-err').first());
    await clicar(p, p.locator('.msg-err a:has-text("Responder")')); await p.waitForURL(/pendencias/);
    await anotar(p, 'Leia o pedido do escritório e escreva a sua resposta', p.locator('details').first());
    await digitar(p, p.locator('textarea[name=texto]').first(), 'Enviei o comprovante do DAS na aba Documentos do mês.');
    await clicar(p, p.locator('button:has-text("Enviar resposta")').first()); await p.waitForURL(/ok=/);
    await anotar(p, 'Resposta enviada. O escritório recebe o aviso e marca como resolvida', p.locator('details').first());
    await legenda(p, 'Prefere a tela escura? Clique no botão da lua no topo (modo noite)'); await clicar(p, p.locator('.tema-botao'));
    await anotar(p, 'A escolha fica salva neste aparelho. Para voltar ao modo dia, clique no sol', p.locator('.tema-botao'));
    await clicar(p, p.locator('.tema-botao'));
    await legenda(p, 'Dúvidas? Clique em "Ajuda" no topo para rever os vídeos'); await clicar(p, p.locator('header.top a:has-text("Ajuda")')); await p.waitForURL(/ajuda/);
  });

  // ======================= ESCRITÓRIO =======================
  await cena('a1-entregas-do-mes', 'admin', async (p) => {
    await ir(p, '/admin'); await titulo(p, 'Entregas do mês', 'Quem já enviou os documentos');
    await legenda(p, 'A tela inicial do escritório tem um cartão para cada área do trabalho'); await mover(p, card(p, 'Entregas do mês'));
    await anotar(p, 'Escolha a competência (mês) que você quer acompanhar', p.locator('.comp-mini select'));
    await p.locator('.comp-mini select').selectOption(C); await clicar(p, p.locator('.comp-mini button')); await p.waitForURL(/competencia=2026-10/);
    await anotar(p, 'O cartão "Entregas do mês" fica VERDE quando todas as empresas enviaram tudo, e vermelho quando falta alguma', card(p, 'Entregas do mês'));
    await clicar(p, card(p, 'Entregas do mês')); await p.waitForURL(/entregas/);
    await anotar(p, 'Verde: a empresa enviou tudo. Vermelho: falta documento ou há arquivo recusado', p.locator('.legenda'));
    await anotar(p, 'Esta empresa ainda não enviou a nota fiscal', p.locator('tr.entrega-vermelho').first());
    await anotar(p, 'A etiqueta "PDF novo" avisa que o cliente mandou algo em "Outros documentos"', p.locator('.tag:has-text("PDF novo")').first());
    await legenda(p, 'Clique em "Cobrar envio": o cliente recebe a cobrança na tela dele, com a lista do que falta');
    await clicar(p, p.locator('tr.entrega-vermelho button:has-text("Cobrar envio")').first()); await p.waitForURL(/ok=/);
    await anotar(p, 'Cobrança enviada! Se ele não responder, clique de novo: o painel conta "Cobrado 2x, 3x…"', p.locator('.cobrado').first());
  });

  await cena('a2-cadastrar-empresa', 'admin', async (p) => {
    await ir(p, `/admin/entregas?competencia=${C}`); await titulo(p, 'Cadastrar empresa e usuário', 'Como colocar um novo cliente no painel');
    await legenda(p, 'Em "Entregas do mês", clique em "+ Cadastrar nova empresa"'); await clicar(p, p.locator('a:has-text("Cadastrar nova empresa")')); await p.waitForURL(/empresas\/nova/);
    await legenda(p, 'Informe a razão social e o CNPJ (o sistema confere se o CNPJ é válido)');
    await digitar(p, 'input[name=razaoSocial]', 'Oficina Nova Era Ltda'); await digitar(p, 'input[name=cnpj]', '33.000.167/0001-01');
    await clicar(p, p.locator('button:has-text("Cadastrar")')); await p.waitForURL(/ok=/);
    await clicar(p, p.locator('tr:has-text("Oficina Nova Era") a:has-text("Abrir")').first()); await p.waitForURL(/empresas\/[0-9a-f-]{36}$/);
    await anotar(p, 'Agora crie o acesso do cliente: nome, e-mail e uma senha provisória (ele troca no primeiro acesso)', p.locator('form:has(button:has-text("Criar usuário"))'));
    const f = p.locator('form:has(button:has-text("Criar usuário"))');
    await digitar(p, f.locator('input[name=nome]'), 'Carlos Exemplo'); await digitar(p, f.locator('input[name=email]'), 'carlos@exemplo.com'); await digitar(p, f.locator('input[name=senha]'), 'Provisoria#Mar2026');
    await clicar(p, f.locator('button:has-text("Criar usuário")')); await p.waitForURL(/ok=/);
    await legenda(p, 'Depois defina quais documentos esta empresa precisa enviar: "Documentos e conferência"'); await clicar(p, p.locator('a:has-text("Documentos e conferência")')); await p.waitForURL(/documentos/);
    const g = p.locator('form:has(button:has-text("Adicionar"))').first();
    await anotar(p, 'Informe o nome do documento. Para extrato, use a palavra "Extrato": só ele vai para a conciliação', g);
    await digitar(p, g.locator('input[name=nome]'), 'Extrato conta corrente'); await digitar(p, g.locator('input[name=instituicao]'), 'Banco Exemplo');
    await legenda(p, 'Marque os formatos aceitos (PDF, OFX...) e clique em "Adicionar"'); await clicar(p, g.locator('input[value=ofx]'));
    await clicar(p, g.locator('button:has-text("Adicionar")')); await p.waitForURL(/ok=/);
    await anotar(p, 'Pronto! A empresa já pode enviar o extrato. Repita para os outros documentos', p.locator('text=Extrato conta corrente').first());
  });

  await cena('a3-conferir-documentos', 'admin', async (p) => {
    await ir(p, `/admin/entregas?competencia=${C}`); await titulo(p, 'Conferir os documentos', 'Aprovar ou recusar o que o cliente enviou');
    await legenda(p, 'Na linha da empresa, clique em "Conferir"'); await clicar(p, p.locator('tr:has-text("Mercadinho Boa Compra") a:has-text("Conferir")')); await p.waitForURL(/documentos/);
    await anotar(p, 'Aqui estão os arquivos enviados. Clique no nome para baixar e conferir', p.locator('a[href^="/api/arquivos/"]').first());
    await legenda(p, 'Está certo? Clique em "Aprovar"'); await clicar(p, p.locator('tr:has-text("Extrato conta corrente") button:has-text("Aprovar")').first()); await p.waitForURL(/ok=/);
    await legenda(p, 'Está errado? Escreva o motivo e clique em "Rejeitar": o cliente vê o motivo e envia de novo');
    const nf = p.locator('tr:has-text("Notas fiscais")'); await digitar(p, nf.locator('input[name=motivo]'), 'Arquivo cortado, envie de novo');
    await clicar(p, nf.locator('button:has-text("Rejeitar")')); await p.waitForURL(/ok=/);
    await anotar(p, 'Mais abaixo ficam os "Outros documentos" que o cliente enviou. Baixar conta como "visto"', p.locator('text=Outros documentos enviados pelo cliente').first());
  });

  await cena('a4-conciliacao', 'admin', async (p) => {
    await ir(p, `/admin/conciliacoes?competencia=${C}`); await titulo(p, 'Conferir a conciliação', 'Revisar, pedir correção e concluir');
    await anotar(p, 'Aqui ficam as conciliações que os clientes enviaram, as que aguardam você vêm primeiro', p.locator('h2').first());
    await clicar(p, p.locator('tr:has-text("Mercadinho Boa Compra") a:has-text("Conferir")').first()); await p.waitForURL(/extratos/);
    await anotar(p, 'Confira os números: movimentações, sem categoria e o saldo de cada banco', p.locator('.kpis-conf'));
    await anotar(p, 'O saldo calculado precisa bater com o saldo final do extrato (o sinal verde)', p.locator('.banco').first());
    await clicar(p, p.locator('button.chip:has-text("Todas")')); await legenda(p, 'Abra a tabela e confira as categorias, as notas e os nomes dos fornecedores');
    await mover(p, p.locator('tbody tr.clicavel').nth(2));
    await legenda(p, 'Achou algo errado? Marque a linha, escreva o que corrigir e clique em "Pedir correção"');
    const cb = p.locator('tbody tr.clicavel input[type=checkbox]').nth(2); await mover(p, cb); await cb.check();
    await digitar(p, p.locator('input[placeholder="O que o cliente precisa corrigir?"]'), 'Confira a categoria desta linha'); await clicar(p, p.locator('button:has-text("Pedir correção")')); await esperar(p, 900);
    await legenda(p, 'Depois, "Devolver para correção" manda tudo de volta ao cliente. Aqui vamos limpar o pedido');
    await cb.check().catch(() => {}); await clicar(p, p.locator('button:has-text("Limpar pedido de correção")')); await esperar(p, 900);
    await legenda(p, 'Tudo certo? "Baixar Excel" gera a planilha para importar na contabilidade'); const dl = p.waitForEvent('download'); await clicar(p, p.locator('a:has-text("Baixar Excel")')); await dl;
    await legenda(p, 'Para finalizar, clique em "Aprovar e concluir". O cliente não altera mais esse mês');
    await clicar(p, p.locator('button:has-text("Aprovar e concluir")')); await p.waitForSelector('.chip.status-concluida');
    await anotar(p, 'Conciliação concluída! Se precisar ajustar depois, use "Reabrir para o cliente"', p.locator('.chip.status-concluida'));
  });

  await cena('a5-pendencias-usuarios-relatorios', 'admin', async (p) => {
    await ir(p, `/admin?competencia=${C}`); await titulo(p, 'Pendências, usuários e relatórios', 'O resto do dia a dia do escritório');
    await legenda(p, 'Pendências: peça ao cliente qualquer informação ou documento extra'); await clicar(p, card(p, 'Pendências')); await p.waitForURL(/pendencias/);
    await anotar(p, 'Veja as respostas dos clientes; o cartão da tela inicial avisa quando chega uma nova', p.locator('table').first());
    const f = p.locator('form:has(button:has-text("Criar solicitação"))'); await anotar(p, 'Para criar um pedido novo, escolha a empresa e clique em "Criar solicitação"', f);
    await mover(p, f.locator('select[name=empresaId]')); await f.locator('select[name=empresaId]').selectOption({ label: 'Auto Peças Modelo Ltda' }); await pausa(500);
    await clicar(p, f.locator('button:has-text("Criar solicitação")')); await p.waitForURL(/pendencias/);
    await legenda(p, 'Escreva o que o cliente precisa fazer e, se quiser, o prazo');
    await digitar(p, p.locator('textarea[name=descricao]'), 'Envie a nota fiscal da compra de peças de outubro.'); await clicar(p, p.locator('button:has-text("Enviar solicitação")')); await p.waitForURL(/ok=/);
    await legenda(p, 'Usuários: crie, bloqueie ou redefina a senha dos acessos'); await ir(p, '/admin'); await clicar(p, card(p, 'Usuários')); await p.waitForURL(/usuarios/);
    await anotar(p, 'Esqueceu a senha? "Redefinir senha" cria uma provisória nova. "Bloquear" tira o acesso', p.locator('table').first());
    await legenda(p, 'Relatórios: visão geral do mês e planilha Excel completa'); await ir(p, `/admin?competencia=${C}`); await clicar(p, card(p, 'Relatórios')); await p.waitForURL(/relatorios/);
    await anotar(p, 'Veja documentos, conciliações e pendências de todas as empresas do mês', p.locator('h2').first());
    await anotar(p, 'Clique para baixar o relatório completo em Excel', p.locator('a:has-text("Baixar relatório completo")'));
  });
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });
