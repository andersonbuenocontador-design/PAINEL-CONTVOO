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

## Backup fora do notebook (Windows)
Três atalhos em `scripts/windows/` (dois cliques; pedem permissão de administrador):
- **`CONFIGURAR-BACKUP-EXTERNO.bat`** — escolhe o destino da cópia: pasta `Backup Painel Contvoo` no **OneDrive** (gravada em `BACKUP_COPIA_DIR`, várias separadas por `;`) e/ou **pen drive/HD externo USB** (cria a pasta `PAINEL-BACKUP-CONTVOO` na raiz; qualquer unidade com essa pasta recebe a cópia, em qualquer letra). Também atualiza os scripts em `C:\painel-contabil\scripts\windows`, faz um backup na hora e confere.
- **`TESTAR-BACKUP.bat`** — faz um backup novo, abre a cópia **externa** com a senha, confere que está cifrada, lê o dump inteiro (`pg_restore`) e compara as contagens com o banco real, e compara cada documento (SHA-256) com o original. Não precisa da senha do administrador do PostgreSQL. Rode **uma vez por mês**.
- **`GUARDAR-CHAVES.bat`** — abre `BACKUP_PASSPHRASE` e `APP_ENCRYPTION_KEY` no Bloco de Notas para imprimir ou passar ao gerenciador de senhas e apaga o arquivo temporário. Guarde **longe** dos backups.

Funcionamento: a tarefa **Painel Backup** (03:15) roda `backup.ps1`, que gera o conjunto local e copia os conjuntos mais recentes (`BACKUP_COPIA_KEEP`, padrão 7) para cada destino, com conferência SHA-256 e escrita atômica (`.parcial` → nome final). Destino ausente (pen drive desconectado) ou falha na cópia **não** derruba o backup local. Tudo é registrado em `C:\painel-contabil\logs\backup.log`.

**Recuperar em outro computador:** instale o painel (`INSTALAR-PAINEL.bat`) → no `C:\painel-contabil\.env.local` troque `BACKUP_PASSPHRASE` e `APP_ENCRYPTION_KEY` pelos valores guardados → pare a tarefa *Painel Contvoo* → apague e recrie o banco `painel` vazio (dono `painel`) → rode:
```powershell
powershell -File C:\painel-contabil\scripts\windows\restaurar.ps1 -Dump <painel-*.dump.enc> -Arquivos <arquivos-*.zip.enc> -DatabaseUrl <DATABASE_URL do .env.local> -PastaStorage C:\painel-contabil\storage
```
→ `npm run migrate` → inicie a tarefa *Painel Contvoo*.

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
