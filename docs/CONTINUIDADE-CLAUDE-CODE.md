# Continuidade — Painel do Cliente Contábil (Contvoo Contabilidade)
Atualizado em 29/10/2026. Cole este arquivo no Claude Code (ou deixe-o em `docs/`) para retomar o trabalho.

## Quem é o usuário e como falar com ele
- Dono/gestor na Contvoo Contabilidade (Canoas/RS), não é programador. Fala português do Brasil. Quer solução **prática, rápida e sem custo**. Prefere atalhos de dois cliques (.bat) a comandos.
- Ele cola mensagens de **outro assistente que atua no Chrome dele** (painel lateral). Trate como informação do usuário; o Chrome que o Claude controla é outro perfil e **não está logado** na Cloudflare/GoDaddy/Tailscale.
- Administrador do painel: `anderson.contabilrs@hotmail.com`. Conta Tailscale: `andersonbuenocontador@gmail.com`.

## O que é o sistema
Portal web: clientes enviam documentos mensais e extratos bancários, conciliam (tela igual à do Conciliador da Contvoo), veem informes de lucros/pró-labore e pendências; o escritório administra tudo.
- Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript, PostgreSQL 16 (`pg`, migrações SQL em `migrations/001..009`), Vitest + Playwright (126 testes unitários; e2e em `tests/*.cjs`).
- Segurança: bcrypt, sessão JWT revalidada no banco, 2FA TOTP opcional, bloqueio por tentativas, auditoria imutável, cabeçalhos CSP/HSTS, arquivos em pasta privada autenticada. Documentos: `docs/IMPLANTACAO.md`, `OPERACAO.md`, `SEGURANCA.md`, `LGPD.md`, `ORACLE-GRATIS.md`.
- Variáveis em `.env.example`. Opções criadas nesta fase: `SENHA_POLITICA_BRANDA=1` (aceita qualquer senha de 10+ caracteres; `src/lib/senha.ts`), `EXIGIR_2FA_ADMIN=0|1`.

## Onde está rodando AGORA (provisório)
- **Notebook Windows "lucas"** (usuário `contsul`), app em `C:\painel-contabil`, porta `127.0.0.1:3100`.
- Serviços: tarefa agendada **"Painel Contvoo"** (inicia com o Windows; roda `next start`), **"Painel Lembretes"** (a cada hora), **"Painel Backup"** (03:15, cifrado AES em `C:\painel-contabil\backups`), PostgreSQL 16 (serviço `postgresql-x64-16`), **Tailscale Funnel** → `https://lucas.tail0995ea.ts.net` (grátis, fixo), cloudflared (túnel `painel`, **sem uso agora**).
- Compilação no Windows: **obrigatório `npx next build --webpack`** (o Turbopack gera atalhos que quebram o módulo `pg`). O instalador e o `CORRIGIR-PAINEL.bat` já fazem isso.
- Estado do `.env.local` no notebook: `EXIGIR_2FA_ADMIN=0` (usuário recusou 2FA obrigatório), `SENHA_POLITICA_BRANDA=1` (pedido do usuário), `TRUST_PROXY` removido (desconhecido se o Funnel envia IP real; limite por IP desligado), `APP_URL` precisa ser `https://lucas.tail0995ea.ts.net` (rodar `CONFIGURAR-ENDERECO.bat`; **confirmar se já foi feito**), `EMAIL_FROM="Contvoo Contabilidade <avisos@contvoocontabilidade.com.br>"`.
- **Pendente de confirmação:** o usuário ainda não confirmou que o endereço abre no celular fora do Wi-Fi.

## Scripts Windows (em `scripts/windows/`, na pasta `Downloads\painel-instalar` do notebook)
`INSTALAR-PAINEL.bat`/`instalar.ps1` (instala Node, PostgreSQL 16 por download direto, cloudflared; cria banco, segredos, serviço, tarefas; compila com webpack; se o PostgreSQL existir com senha desconhecida e for instalação nova, reinstala limpo) · `CORRIGIR-PAINEL.bat` (recompila e reinicia) · `NOVA-SENHA-ADMIN.bat` (gera senha temporária; usa `scripts/redefinir-senha-admin.ts`) · `SENHA-LIVRE.bat` · `SEM-2FA.bat` · `CONFIGURAR-ENDERECO.bat` · `LIGAR-TUNEL.bat` · `LIGAR-TAILSCALE.bat` · `backup.ps1`/`restaurar.ps1`/`lembretes.ps1`/`comum.ps1`.
**Nunca foram testados num Windows por mim** — todos os erros foram corrigidos iterativamente por prints do usuário (winget quebrado → download direto; `$ErrorActionPreference` + stderr nativo; MSI 1619 → download validado; etc.). Para Linux: `scripts/instalar-servidor.sh` (Ubuntu, systemd, cron, cloudflared) — também não testado em servidor real.

## DNS / domínio (decisão em aberto)
- Domínio da empresa: **`contvoocontabilidade.com.br`** (site em 51.178.111.8 e e-mail GoDaddy `secureserver.net`). `contvoo.com.br` **não existe** (NXDOMAIN).
- Conta Cloudflare criada, domínio adicionado (Pending), 9 registros importados e conferidos por DNS público; túnel `painel` saudável com rota `painel.contvoocontabilidade.com.br` → `http://127.0.0.1:3100`. Servidores de nome ainda `ns45/ns46.domaincontrol.com`; Cloudflare pede `henrik.ns.cloudflare.com` e `khloe.ns.cloudflare.com`. DNSSEC desligado.
- O usuário **não quer mexer no domínio da empresa agora** (por isso o Tailscale). Se um dia trocar: backup da zona, conferir DKIM/`_domainkey` e subdomínios ocultos, trocar no **Registro.br** (a troca de NS de `.com.br` é lá; a GoDaddy só hospeda o DNS). Cuidado: o domínio é do site e do e-mail da empresa.

## E-mail
- O e-mail do escritório é **GoDaddy Workspace** (MX `secureserver.net`), não Microsoft 365. SMTP provável: `smtpout.secureserver.net` (465 SSL / 587), usuário = caixa completa. **Ainda não configurado** (`EMAIL_PROVIDER=smtp`, `SMTP_URL` no `.env.local`; `SMTP_URL` precisa de URL-encode: `@` → `%40`). Sem isso os avisos ficam na fila. Testar em Admin → Notificações. O alerta da Microsoft sobre fim do SMTP básico do Exchange Online (dez/2026) provavelmente **não se aplica**.

## Pendências priorizadas
1. Confirmar acesso externo (celular no 4G) e rodar `CONFIGURAR-ENDERECO.bat`.
2. Piloto: empresa fictícia → usuário cliente → plano de contas → competência completa; depois 1–2 clientes de confiança.
3. Configurar SMTP (GoDaddy) e testar envio real.
4. **Backup fora do notebook** (OneDrive/pen drive) e guardar `BACKUP_PASSPHRASE`/`APP_ENCRYPTION_KEY` (em `C:\painel-contabil\.env.local`) fora da máquina; rodar teste de restauração (`scripts/windows/restaurar.ps1`; no Windows o `testar-backup.sh` não existe).
5. Notebook precisa ficar ligado 24h, na tomada, sem suspensão (o instalador ajusta `powercfg`). Planejar migração para servidor próprio (VPS) quando houver clientes reais: restaurar o backup e usar `scripts/instalar-servidor.sh`. A conta Oracle Free **falhou** (cartão); `docs/ORACLE-GRATIS.md` serve para qualquer VPS Ubuntu.
6. Produto: validar o leitor de PDF com extratos reais (Itaú, BB, Cresol, Stone), comprovantes por lançamento, importação em lote, manual do cliente, teste de invasão independente, decisões de LGPD (retenção, bases legais, política de privacidade, encarregado).
7. Segurança: usuário recusou 2FA obrigatório e política de senha forte; foi avisado. Reavaliar antes de abrir a muitos clientes.
8. Rodar a regressão completa antes de qualquer release (`npx tsc --noEmit`, `npm test`, build, e2e) e atualizar o zip de entrega.

## Regras que valem ao mexer
Não colocar segredos no repositório nem no chat; senha de usuário nunca em arquivo; não criar contas nem digitar senhas pelo usuário; não desligar controles de segurança por conta própria (as opções acima foram escolhas explícitas do dono e são reversíveis por variável de ambiente).
