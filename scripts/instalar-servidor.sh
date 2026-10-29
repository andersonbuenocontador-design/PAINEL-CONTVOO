#!/usr/bin/env bash
# Instala/atualiza o Painel num Ubuntu 22.04/24.04 (Oracle Always Free ou qualquer VPS). Executar como root:
#   sudo ADMIN_EMAIL=voce@contvoocontabilidade.com.br bash instalar-servidor.sh /caminho/painel-contabil.zip
# Opcional: DOMINIO=painel.contvoocontabilidade.com.br  TUNNEL_TOKEN=<token do Cloudflare Tunnel>
# Seguro para reexecutar (atualização): não recria banco, não troca segredos e não apaga arquivos enviados.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Execute como root (sudo)."; exit 1; }
ZIP="${1:?Informe o caminho do painel-contabil.zip}"; [ -f "$ZIP" ] || { echo "Arquivo não encontrado: $ZIP"; exit 1; }
DOMINIO="${DOMINIO:-painel.contvoocontabilidade.com.br}"; APP=/opt/painel-contabil; PORTA=3100
export DEBIAN_FRONTEND=noninteractive

echo "== 1/7 pacotes"
apt-get update -qq
apt-get install -y -qq curl unzip ca-certificates gnupg openssl postgresql postgresql-contrib >/dev/null
if ! command -v node >/dev/null || ! node -v | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null
fi
echo "   node $(node -v), $(psql --version | cut -d' ' -f3 | head -c 20)"

echo "== 2/7 usuário e código"
id painel >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin painel
mkdir -p "$APP"; NOVO=0; [ -f "$APP/.env.local" ] || NOVO=1
if [ "$NOVO" = 0 ]; then ( cd "$APP" && bash scripts/backup.sh ) || echo "   (aviso) backup anterior à atualização falhou"; fi
unzip -oq "$ZIP" -d "$APP" -x ".env.local" "storage/*" "backups/*"

echo "== 3/7 banco e configuração"
if [ "$NOVO" = 1 ]; then
  : "${ADMIN_EMAIL:?Defina ADMIN_EMAIL para o 1º administrador}"
  PGPW=$(openssl rand -hex 16); ADMPW=$(openssl rand -hex 10)
  su postgres -c "psql -v ON_ERROR_STOP=1 -qc \"CREATE ROLE painel LOGIN PASSWORD '$PGPW'\" -qc \"CREATE DATABASE painel OWNER painel\""
  umask 077
  cat > "$APP/.env.local" <<ENV
DATABASE_URL=postgres://painel:$PGPW@127.0.0.1:5432/painel
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
APP_ENCRYPTION_KEY=$(openssl rand -base64 48 | tr -d '\n')
SEED_ADMIN_EMAIL=$ADMIN_EMAIL
SEED_ADMIN_PASSWORD=$ADMPW
APP_URL=https://$DOMINIO
EMAIL_FROM="Contvoo Contabilidade <avisos@contvoocontabilidade.com.br>"
#EMAIL_PROVIDER=smtp
#SMTP_URL=smtp://usuario%40contvoocontabilidade.com.br:SENHA@smtp.office365.com:587
CRON_SECRET=$(openssl rand -hex 24)
EXIGIR_2FA_ADMIN=1
TRUST_PROXY=1
STORAGE_DIR=$APP/storage
RETENCAO_ANOS=5
BACKUP_PASSPHRASE=$(openssl rand -hex 24)
BACKUP_DIR=$APP/backups
BACKUP_KEEP=14
ENV
  echo "   .env.local criado. SENHA TEMPORÁRIA do administrador ($ADMIN_EMAIL): $ADMPW  (será obrigatório trocar no 1º acesso)"
fi
mkdir -p "$APP/storage" "$APP/backups"; chown -R painel:painel "$APP"; chmod 600 "$APP/.env.local"; chmod 700 "$APP/backups" "$APP/storage"

echo "== 4/7 instalar, migrar, compilar"
su -s /bin/bash painel -c "cd $APP && npm ci --no-audit --no-fund >/dev/null && npm run migrate && { [ $NOVO = 0 ] || npm run seed; } && npm run build >/dev/null"
if [ "$NOVO" = 1 ]; then sed -i '/^SEED_ADMIN_PASSWORD=/d' "$APP/.env.local"; fi
su -s /bin/bash painel -c "cd $APP && npm run verificar -- --producao" || { echo "verificar apontou ERROS; corrija antes de usar."; }

echo "== 5/7 serviço"
cat > /etc/systemd/system/painel.service <<UNIT
[Unit]
Description=Painel do Cliente Contabil
After=network.target postgresql.service
[Service]
WorkingDirectory=$APP
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p $PORTA
Restart=always
User=painel
EnvironmentFile=$APP/.env.local
Environment=NODE_ENV=production
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable painel >/dev/null 2>&1; systemctl restart painel

echo "== 6/7 agendamentos (lembretes por hora, backup diário)"
cat > /usr/local/bin/painel-cron.sh <<CRON
#!/usr/bin/env bash
set -a; . $APP/.env.local; set +a
curl -fsS -m 60 -H "Authorization: Bearer \$CRON_SECRET" http://127.0.0.1:$PORTA/api/notificacoes/processar >/dev/null
CRON
chmod 755 /usr/local/bin/painel-cron.sh
cat > /etc/cron.d/painel <<CRON
7 * * * * painel /usr/local/bin/painel-cron.sh
15 3 * * * painel cd $APP && /usr/bin/npm run backup >> $APP/backups/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/painel

echo "== 7/7 Cloudflare Tunnel (sem abrir portas)"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb" && dpkg -i /tmp/cloudflared.deb >/dev/null
fi
if [ -n "${TUNNEL_TOKEN:-}" ]; then cloudflared service install "$TUNNEL_TOKEN" || true; else echo "   cloudflared instalado. Falta ligar o túnel: veja docs/ORACLE-GRATIS.md (passo do Tunnel)."; fi

sleep 4; echo "== verificação local"; curl -fsS "http://127.0.0.1:$PORTA/api/saude" && echo
echo "Pronto. O painel escuta só em 127.0.0.1:$PORTA; o acesso público é pelo Cloudflare Tunnel em https://$DOMINIO"
