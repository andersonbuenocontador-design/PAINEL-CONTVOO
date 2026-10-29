# Painel do Cliente Contábil (Contvoo)

Portal web para o escritório e seus clientes: documentos mensais, extratos bancários com conciliação, informes de lucros e retiradas, pendências e avisos por e-mail. Next.js + TypeScript + PostgreSQL.

## Começar (desenvolvimento)
```bash
cp .env.example .env.local        # preencha DATABASE_URL, SESSION_SECRET, SEED_ADMIN_* (use aspas se a senha tiver #)
npm install && npm run migrate && npm run seed
npm run dev                       # http://localhost:3000
npm run verificar                 # confere o ambiente
```
Produção: **`docs/IMPLANTACAO.md`** (leia antes de publicar).

## O que existe
| Etapa | Entrega |
|---|---|
| 1 | Login, empresas, usuários, vínculos, permissões, painéis do escritório e do cliente, auditoria imutável |
| 2 | Documentos mensais: exigências por empresa, modelos, envio com versões, aprovação/rejeição, indicadores por competência |
| 3 | Extratos OFX/CSV/Excel/PDF (leitores do Conciliador Contvoo), prévia, duplicidades, plano de contas por cliente (`/admin/empresas/<id>/plano`), classificação automática com confiança e aprendizado, tela de conciliação igual à do Conciliador |
| 4 | Fluxo da competência: cliente envia → escritório confere, aponta linhas e devolve ou aprova; conferência de saldos; fila e exportações |
| 5 | Sócios e informes de lucros/retiradas com versões, acesso restrito por sócio, CPF mascarado, registro de downloads |
| 6 | Pendências com prazo e histórico, avisos por e-mail (fila, provedor SMTP plugável, lembretes), relatório geral |
| 7 | 2FA (TOTP), limite de tentativas por IP, política de senha, CSP/HSTS, LGPD (retenção, exportar/anonimizar), backup cifrado testado, health check |

## Testes
```bash
npm test                    # unitários/serviços (banco `painel_test`)
npx tsc --noEmit            # tipos
# navegador (app em :3100 com o banco recém-semeado): node tests/e2e*.cjs
npm run testar-backup       # backup → restauração → comparação
```
Os testes de navegador de cada módulo estão em `tests/e2e-*.cjs`. Todos usam **dados fictícios**.

## Documentação
- `docs/IMPLANTACAO.md` · `docs/OPERACAO.md` · `docs/SEGURANCA.md` · `docs/LGPD.md`

## Limites e pendências conhecidos (resumo)
- Leitores de PDF de Itaú, BB, Cresol, Stone e demais foram portados do Conciliador mas **só testados com PDFs fictícios** (Banrisul e tabela genérica). PDF digitalizado (imagem) não é lido.
- Comprovantes por movimentação (anexar nota/recibo a cada lançamento) **não foram implementados**.
- Sem teste de invasão independente, sem antivírus nos uploads; envio de e-mail depende de configurar o SMTP; prazos e bases legais da LGPD precisam ser definidos pelo escritório. Detalhes em `docs/SEGURANCA.md` e `docs/LGPD.md`.
