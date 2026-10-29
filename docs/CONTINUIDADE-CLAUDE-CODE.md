# Continuidade — Painel do Cliente Contábil (Contvoo Contabilidade)
Atualizado em 29/10/2026. Cole este arquivo no Claude Code (ou deixe-o em `docs/`) para retomar o trabalho.

## Quem é o usuário e como falar com ele
- Dono/gestor na Contvoo Contabilidade (Canoas/RS), não é programador. Fala português do Brasil. Quer solução **prática, rápida e sem custo**.
- Às vezes cola mensagens de outro assistente que atua no Chrome dele: trate como informação do usuário.
- Administrador do painel: `anderson.contabilrs@hotmail.com`.

## O que é o sistema
Portal web: clientes enviam documentos mensais e extratos bancários, conciliam (tela igual à do Conciliador da Contvoo), veem informes de lucros/pró-labore e pendências; o escritório administra tudo.
- Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript, PostgreSQL (`pg`, migrações SQL em `migrations/001..009`), Vitest (140 testes) + Playwright (e2e em `tests/*.cjs`, 5 conjuntos).
- Segurança: bcrypt, sessão JWT revalidada no banco, 2FA TOTP opcional, bloqueio por tentativas, auditoria imutável, CSP/HSTS, documentos em bucket privado. Docs: `docs/NUVEM.md` (implantação atual), `OPERACAO.md`, `SEGURANCA.md`, `LGPD.md`, `IMPLANTACAO.md` (servidor próprio).
- Opções escolhidas pelo dono (reversíveis por variável): `SENHA_POLITICA_BRANDA=1`, `EXIGIR_2FA_ADMIN=0`.

## Decisão de 29/10/2026: sair do notebook, ir para a nuvem grátis
O usuário pediu "sem banco de dados local". Escolheu **adaptar o código atual** (não reescrever) e **Render grátis + Supabase grátis**.
- **Render** (site, `render.yaml` = Blueprint, região virginia, `npm run start:nuvem` = migrate + seed opcional + next start). Grátis dorme após 15 min. **SMTP bloqueado no Render grátis** → e-mail por **Brevo** (API HTTPS, `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`).
- **Supabase** (região East US / North Virginia): Postgres via **Session pooler** (porta 5432, IPv4) com TLS (`src/lib/db.ts` → `configPg`; `DATABASE_CA_CERT` opcional para verificar); documentos no **Supabase Storage**, bucket privado `documentos` criado pelo `migrate` (`src/lib/storage.ts`, REST via fetch; chave nova `sb_secret_` só no header `apikey`, legada JWT também como Bearer — comportamento com a chave nova **não confirmado em projeto real**).
- `migrate` também roda `protegerApiSupabase`: RLS ligado sem políticas + REVOKE de `anon`/`authenticated` (a API automática do Supabase não expõe nada).
- **GitHub Actions**: `agendador.yml` (de hora em hora chama `/api/notificacoes/processar` com `CRON_SECRET`; também mantém o Supabase ativo) e `backup.yml` (03:15 BRT: `scripts/backup-nuvem.sh` + `scripts/testar-backup-nuvem.sh` num postgres:17 descartável; artifact 7 dias). Restauração: `scripts/restaurar-nuvem.sh` (filtra o `CREATE SCHEMA public`).
- Removidos: `scripts/windows/*` (instalador, backup externo etc.), `scripts/instalar-servidor.sh`, `docs/ORACLE-GRATIS.md`. O notebook "lucas" (Tailscale `https://lucas.tail0995ea.ts.net`) deve ser aposentado depois que a nuvem funcionar (Parte 6 do `docs/NUVEM.md`); não havia clientes reais nele.
- Validação feita no ambiente de nuvem do Claude: tsc, 140 testes unitários, build, **todos os e2e** rodando com `npm run start:nuvem` contra um **simulador da API do Supabase Storage**, backup → teste de restauração → restauração completa num "projeto novo", e a proteção RLS com papéis anon/authenticated simulados. **Nada foi testado ainda em contas reais** de Render/Supabase/Brevo/GitHub.

## Próximos passos (na ordem)
1. Usuário cria GitHub + repositório privado `painel-contvoo` e conecta em claude.ai/connect-github → Claude faz o push (branch `main`).
2. Usuário segue `docs/NUVEM.md` Partes 2–4 (Supabase, Render Blueprint, segredos do GitHub). Conferir: `/api/saude` = ok, login, envio de um PDF, *Backup diário* verde.
3. Brevo (Parte 5) e teste de e-mail em Admin → Notificações.
4. Piloto: empresa fictícia → usuário cliente → plano de contas → competência completa; depois 1–2 clientes de confiança.
5. Aposentar o notebook (Parte 6).
6. Produto: validar leitor de PDF com extratos reais (Itaú, BB, Cresol, Stone), comprovantes por lançamento, importação em lote, manual do cliente, teste de invasão, decisões de LGPD (bases legais, retenção, política de privacidade com transferência internacional, encarregado, DPAs dos fornecedores).
7. Segurança: reavaliar 2FA obrigatório e senha forte antes de abrir a muitos clientes; definir `DATABASE_CA_CERT`.

## Regras que valem ao mexer
Não colocar segredos no repositório nem no chat; senha de usuário nunca em arquivo; não criar contas nem digitar senhas pelo usuário; não desligar controles de segurança por conta própria. Rodar a regressão completa antes de cada entrega (`npx tsc --noEmit`, `npm test`, `npm run build`, e2e).
