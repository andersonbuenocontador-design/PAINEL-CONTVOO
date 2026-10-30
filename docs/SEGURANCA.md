# Segurança: controles, provas e limites

## O que protege o quê
| Risco | Controle | Onde | Como é provado |
|---|---|---|---|
| Cliente ver dado de outra empresa | Toda leitura/escrita passa por `obterEmpresa` (vínculo explícito + empresa ativa); empresa alheia responde igual a "não existe" | `src/lib/services/*` | `tests/seguranca.test.ts` (41 tentativas cruzadas), `tests/*.test.ts`, e2e com cliente de outra empresa |
| Adivinhar IDs/URLs | IDs UUID validados; permissão checada no servidor, nunca na tela | serviços | testes de IDOR |
| Arquivos expostos | Supabase Storage em bucket **privado** (o painel recusa iniciar se o bucket estiver público), acessado só pelo servidor com a chave secreta; em disco, pasta fora de `public/`; só saem por rota autenticada; nome/tipo/assinatura/tamanho validados; `nosniff` + `attachment` | `storage.ts`, `/api/arquivos`, `/api/informes` | testes de upload e de caminho (`../`) |
| Senha fraca/vazada | bcrypt (custo 12), política (tamanho, lista de óbvias, sequência, contém e-mail), troca obrigatória no 1º acesso | `senha.ts`, `usuarios.ts` | `tests/seguranca.test.ts` |
| Força bruta | Bloqueio da conta (5 falhas/15 min) + limite por IP (30 falhas/15 min, com `TRUST_PROXY=1`); mensagem de login genérica | `usuarios.ts`, `seguranca.ts` | testes |
| Senha roubada | **2FA TOTP** (RFC 6238), anti-replay, 8 códigos de recuperação de uso único (só hash), segredo cifrado AES-256-GCM; obrigatório para admin com `EXIGIR_2FA_ADMIN=1` | `totp.ts`, `cripto.ts`, `seguranca.ts` | vetores oficiais da RFC + e2e do fluxo |
| Sessão roubada/obsoleta | Cookie HttpOnly/SameSite/Secure (produção), JWT 8 h **revalidado no banco a cada requisição** (usuário ativo + `token_version`); bloquear usuário/trocar senha/redefinir 2FA derruba sessões; token de 2º fator não vale como sessão | `session.ts` | testes + e2e |
| Adulteração de registros | Auditoria só de inserção (trigger bloqueia update/delete/truncate); registra quem, o quê, quando | migração 001 | teste de imutabilidade |
| XSS/clickjacking/injeção | React escapa saída; CSP (`frame-ancestors 'none'`, origens fechadas), HSTS, `X-Frame-Options`, `Permissions-Policy`; SQL sempre parametrizado; busca escapa curingas | `next.config.mjs`, serviços | e2e sem violações de CSP; testes de busca maliciosa |
| CSRF | Server Actions do Next (verificação de origem) + cookies SameSite=Lax; rotas POST exigem segredo | framework | — |
| Vazamento por e-mail | E-mails nunca levam conteúdo, valores ou documentos: só avisam e apontam para o painel (login) | `notificacoes.ts` | teste de conteúdo |
| Perda de dados | Backup diário cifrado + restauração testada automaticamente num banco descartável | `.github/workflows/backup.yml`, `scripts/*-nuvem.sh` | execução verde no GitHub Actions |
| API automática do Supabase expor tabelas | RLS ligado sem políticas em todas as tabelas de `public` e permissões retiradas de `anon`/`authenticated` a cada `migrate` | `scripts/migrate.ts` (`protegerApiSupabase`) | teste com papéis simulados |
| Conexão com o banco interceptada | TLS obrigatório fora de localhost; certificado verificado quando `DATABASE_CA_CERT` está definido | `src/lib/db.ts` | `tests/nuvem.test.ts` |

## Limites conhecidos (seja realista)
- **CSP permite `'unsafe-inline'` em scripts** (necessário ao Next.js); mitiga, mas não elimina XSS se alguém introduzir uma falha. O restante da política é restritivo.
- **Limite por IP** só funciona atrás de **um** proxy confiável que sobrescreva `X-Forwarded-For`; sem isso, só há bloqueio por conta.
- **Sem antivírus/varredura de malware** nos arquivos enviados (a validação checa tipo e assinatura, não conteúdo malicioso). Recomenda-se integrar um antivírus.
- **PDF digitalizado (imagem)** não é lido (sem OCR); o leitor dos bancos Itaú, BB, Cresol, Stone etc. foi portado do Conciliador e **só foi testado com PDFs fictícios** de Banrisul e tabela genérica.
- **Sessões**: 8 horas absolutas, sem logout por inatividade.
- **Sem `DATABASE_CA_CERT`** a conexão com o banco é cifrada, mas o certificado não é verificado. Defina-a (passo em `docs/NUVEM.md`).
- Na nuvem, as chaves (`SUPABASE_SECRET_KEY`, `DATABASE_URL`, `BACKUP_PASSPHRASE`) ficam no Render e nos segredos do GitHub: proteja essas contas com **2FA** e não dê acesso a terceiros.
- **Escolhas do dono (reversíveis no Render → Environment):** `EXIGIR_2FA_ADMIN=0`, `SENHA_POLITICA_BRANDA=1` e verificação em duas etapas **oculta para clientes** (`MFA_CLIENTES=1` religa; quem já ativou continua usando). Com o site aberto na internet, recomenda-se `EXIGIR_2FA_ADMIN=1` e remover `SENHA_POLITICA_BRANDA`.
- A chave `APP_ENCRYPTION_KEY` fica no ambiente do servidor; quem tiver o servidor e o banco consegue abrir os segredos de 2FA.
- A auditoria é imutável pelo aplicativo, mas não é assinada: quem tem acesso de superusuário ao PostgreSQL pode alterá-la (restrinja esse acesso).
- **Não houve teste de invasão independente nem varredura dinâmica (DAST).** Faça antes de produção, especialmente por tratar extratos bancários e dados de sócios.

## Dependências
Rode `npm audit` a cada atualização; mantenha Node, PostgreSQL e o sistema operacional com correções em dia.
