# Guia de implantação

> Este guia foi escrito a partir do que foi testado no ambiente de desenvolvimento (Linux, Node 22, PostgreSQL 16).
> Foi ensaiado do zero numa cópia limpa (npm ci → migrate → seed → build → verificar → produção → backup/restauração → SMTP de teste), mas **ainda não em servidor de produção real**: faça o primeiro ciclo completo (instalar, migrar, restaurar backup) num ambiente de teste, com dados fictícios, antes de usar dados de clientes.

## Requisitos
- Linux com Node.js **20 ou superior** e PostgreSQL **14 ou superior** (testado no 16). O banco **não** deve ficar exposto à internet (porta 5432 só local/rede privada).
- Um proxy reverso com **HTTPS** (nginx, Caddy…) na frente do aplicativo. Sem HTTPS o painel não deve ser usado.
- Disco para os arquivos (pasta `STORAGE_DIR`, fora de qualquer pasta pública) e para os backups.

## 1. Banco
```sql
CREATE ROLE painel LOGIN PASSWORD '<senha forte>';   -- use letras e números (ex.: openssl rand -hex 16); símbolos como # @ / : quebram a DATABASE_URL
CREATE DATABASE painel OWNER painel;
```

## 2. Aplicativo
```bash
git clone <repositório> && cd painel-contabil
npm ci
cp .env.example .env.local      # preencha (tabela abaixo) e proteja: chmod 600 .env.local
npm run migrate                 # cria/atualiza as tabelas
npm run seed                    # cria o 1º administrador (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD); troca de senha obrigatória no 1º acesso
npm run build
npm run verificar -- --producao # confere o ambiente; só siga com 0 erros
```
Remova `SEED_ADMIN_PASSWORD` do `.env.local` depois do `seed`.

## 3. Variáveis de ambiente
| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | conexão PostgreSQL |
| `SESSION_SECRET` | sim (≥32 car.) | assinatura das sessões. `openssl rand -base64 48` |
| `APP_ENCRYPTION_KEY` | recomendada (≥32 car., diferente da anterior) | cifra o segredo do 2FA no banco. **Guarde junto dos backups**: sem ela os 2FA não abrem |
| `APP_URL` | sim em produção | endereço público `https://…` (links dos e-mails) |
| `EXIGIR_2FA_ADMIN=1` | recomendada | obriga administradores a usar 2º fator |
| `TRUST_PROXY=1` | se houver proxy | ativa limite de tentativas por IP (veja o proxy abaixo) |
| `STORAGE_DIR` | não | pasta dos arquivos (padrão `./storage`) |
| `EMAIL_PROVIDER=smtp`, `SMTP_URL`, `EMAIL_FROM` | para e-mails | avisos de pendências; sem isso os avisos ficam na fila. Outlook/Microsoft 365: veja a seção "E-mail pelo Outlook" abaixo |
| `CRON_SECRET` (≥24 car.) | para o agendador | autoriza `/api/notificacoes/processar` (POST ou GET, sempre com `Authorization: Bearer`) |
| `RETENCAO_ANOS` | não (padrão 5) | prazo de guarda; **defina com o jurídico/encarregado** |
| `BACKUP_*` | para backup | veja `docs/OPERACAO.md` |

## 4. Serviço (systemd, exemplo)
```ini
[Unit]
Description=Painel do Cliente Contabil
After=network.target postgresql.service
[Service]
WorkingDirectory=/opt/painel-contabil
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p 3100
Restart=always
User=painel
EnvironmentFile=/opt/painel-contabil/.env.local
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
```

## 5. Proxy reverso (nginx, trecho)
```nginx
server {
  listen 443 ssl http2; server_name painel.seuescritorio.com.br;
  # certificado (Let's Encrypt ou outro) ...
  client_max_body_size 25m;                       # uploads de até 20 MB
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # SOBRESCREVE (não acrescente): o painel confia nesse valor com TRUST_PROXY=1
    proxy_set_header X-Forwarded-Proto https;
  }
}
server { listen 80; server_name painel.seuescritorio.com.br; return 301 https://$host$request_uri; }
```

### Cloudflare na frente do servidor (painel.contvoocontabilidade.com.br)
1. Em Cloudflare → DNS: registro `painel` apontando para o IP do servidor, com a nuvem laranja (proxy) ligada. SSL/TLS em **Full (strict)**, com certificado de origem da Cloudflare (ou Let's Encrypt) no nginx. Ative "Always Use HTTPS".
2. Alternativa mais segura: **Cloudflare Tunnel** (`cloudflared`) — o servidor não abre portas 80/443 para a internet; o túnel aponta `painel.contvoocontabilidade.com.br` para `http://127.0.0.1:3100`.
3. **IP real do cliente (importante):** atrás da Cloudflare, o `$remote_addr` do nginx é o da Cloudflare. Com `TRUST_PROXY=1` o painel limitaria tentativas de login por IP da Cloudflare, não do usuário. No nginx use `proxy_set_header X-Forwarded-For $http_cf_connecting_ip;` (e só aceite tráfego vindo da Cloudflare: firewall liberando apenas os IPs publicados em cloudflare.com/ips ou use o Tunnel).
4. Regras: não faça cache de nada (`Cache-Control: no-store` já vem do painel; crie regra "Bypass cache" para o domínio). Limite de upload do plano gratuito é 100 MB, acima dos 25 MB do painel.
5. Opcional: WAF/Rate limiting em `/login` e Cloudflare Access (e-mails do escritório) na frente de `/admin`.

## 6. Agendamentos (cron/systemd timer)
- **A cada hora:** `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://painel.../api/notificacoes/processar` (lembretes de prazo e envio da fila de e-mails).
- **Todo dia:** `npm run backup` (veja `docs/OPERACAO.md`).
- **Teste de restauração:** `npm run testar-backup` cria e apaga um banco temporário, então o papel do painel precisa de `CREATEDB` (`ALTER ROLE painel CREATEDB;` só durante o teste) ou informe `TESTE_ADMIN_URL=postgres://superusuario:senha@localhost:5432`.
- **Monitoramento:** `GET /api/saude` (200 = banco e armazenamento ok; 503 = problema).

### E-mail pelo Outlook (Microsoft 365)
- `SMTP_URL=smtp://usuario%40contvoocontabilidade.com.br:SENHA@smtp.office365.com:587` (o `@` do usuário vira `%40`; senha com símbolos precisa ser codificada em URL). Porta 587 com STARTTLS.
- Exige que a caixa tenha **SMTP AUTH habilitado** (Exchange Admin Center → caixa → Gerenciar aplicativos de e-mail) e sem MFA bloqueando senha simples. Use uma caixa dedicada (ex.: `avisos@`), não a de uma pessoa.
- **Risco de prazo:** a Microsoft informa que a autenticação básica do SMTP AUTH será desativada por padrão a partir de dezembro de 2026, com data final de remoção a anunciar. O painel hoje usa usuário e senha; se isso for bloqueado, trocar por um serviço de envio (Amazon SES, Brevo, Resend…) é só mudar `SMTP_URL`, ou implementar OAuth2 no painel.
- Teste real: Administração → Notificações → enviar um aviso para uma caixa sua e conferir entrega e caixa de spam (SPF/DKIM do domínio).

## 7. Primeiro acesso
1. O administrador entra, troca a senha e **ativa o 2FA** (menu: clique no próprio nome). Guarde os códigos de recuperação.
2. Cadastre empresas, usuários, plano de contas de cada cliente, documentos exigidos (ou aplique um modelo) e contas bancárias.
3. Faça uma competência de teste ponta a ponta com uma empresa fictícia antes de convidar clientes.

## 8. Atualizar versão
```bash
git pull && npm ci && npm run migrate && npm run build && sudo systemctl restart painel
npm run verificar -- --producao
```
Faça `npm run backup` **antes** de migrar.

## Checklist de entrada em produção
- [ ] `npm run verificar -- --producao` sem erros · HTTPS válido · porta do banco fechada
- [ ] `EXIGIR_2FA_ADMIN=1`, `APP_ENCRYPTION_KEY` própria, `.env.local` com `chmod 600`
- [ ] Backup diário rodando **e restauração testada** (`npm run testar-backup`)
- [ ] E-mail configurado e testado (`/admin/notificacoes`)
- [ ] Prazo de retenção, base legal e política de privacidade definidos (`docs/LGPD.md`)
- [ ] Teste de invasão/revisão independente feito (recomendado; veja `docs/SEGURANCA.md`)
