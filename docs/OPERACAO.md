# Operação do dia a dia

## Backup e restauração
```bash
npm run backup            # banco (pg_dump) + arquivos; cifrado se BACKUP_PASSPHRASE estiver definida (RECOMENDADO)
npm run testar-backup     # prova que o backup serve: restaura num banco temporário e compara contagens e arquivos
scripts/restaurar.sh <painel-*.dump[.enc]> <arquivos-*.tar.gz[.enc]> <DATABASE_URL_destino_vazio> <pasta_storage_destino>
```
- Variáveis: `BACKUP_DIR` (padrão `./backups`), `BACKUP_KEEP` (padrão 14 conjuntos), `BACKUP_PASSPHRASE`.
- **Rotina sugerida:** backup diário (cron) · cópia **fora do servidor** (outro local) · `testar-backup` todo mês · guardar `BACKUP_PASSPHRASE` e `APP_ENCRYPTION_KEY` **fora do servidor**.
- Restaurando: crie o banco vazio, rode `restaurar.sh`, aponte o `.env.local` para ele, `npm run migrate` (aplica o que faltar) e `npm run verificar`.

## Rotina
- **Monitorar:** `GET /api/saude` (200/503). Acompanhe `/admin/notificacoes` (fila e falhas) e `/admin/auditoria`.
- **Novo funcionário no escritório:** criar usuário admin → ele troca a senha e ativa o 2FA. **Saída:** bloquear o usuário (derruba sessões na hora).
- **Cliente perdeu o celular do 2FA:** Usuários → *Redefinir 2FA*; a pessoa configura de novo no próximo login.
- **Cliente saiu / pediu exclusão:** `/admin/lgpd` → exportar/anonimizar o usuário; desativar a empresa (histórico permanece).
- **Ajustar plano de contas:** `/admin/empresas/<id>/plano` (e *Reclassificar não revisados* se mudar).

## Resposta a incidente (roteiro)
1. **Conter:** bloquear usuários/sessões suspeitos (Usuários → Bloquear), trocar `SESSION_SECRET` se houver suspeita de vazamento (derruba **todas** as sessões), isolar o servidor se necessário.
2. **Preservar evidências:** exportar a auditoria (`/admin/auditoria`) e os logs do servidor/proxy; fazer backup do estado atual.
3. **Avaliar:** quais empresas/titulares e quais dados foram afetados (a auditoria registra acessos, downloads de informes, operações).
4. **Comunicar:** decisão e prazos de comunicação à ANPD e aos titulares são do controlador com o jurídico/encarregado (defina o procedimento **antes** de precisar).
5. **Corrigir e prevenir:** corrigir a causa, rotacionar segredos (`SESSION_SECRET`, `APP_ENCRYPTION_KEY`, senhas SMTP/banco), revisar este guia e `docs/SEGURANCA.md`.
6. **Registrar:** data, causa, impacto e ações (registro interno).

## Solução de problemas
| Sintoma | O que verificar |
|---|---|
| `/api/saude` 503 | banco fora do ar ou `STORAGE_DIR` sem permissão de escrita |
| Ninguém consegue logar após trocar `SESSION_SECRET` | esperado: sessões antigas caem; entre de novo |
| 2FA "não abre" após restaurar | `APP_ENCRYPTION_KEY` diferente da original: restaure a chave ou *Redefinir 2FA* |
| E-mails não saem | `/admin/notificacoes` (provedor configurado? falhas?) e o agendador do `/api/notificacoes/processar` |
| Upload recusado | formato/tamanho (20 MB) ou `client_max_body_size` do proxy |
