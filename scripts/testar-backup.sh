#!/usr/bin/env bash
# Prova que o backup SERVE: faz backup (cifrado), restaura num banco temporário e compara contagens e arquivos. Uso: npm run testar-backup
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] && { set -a; . ./.env.local; set +a; }
: "${DATABASE_URL:?}"; export BACKUP_DIR="$(mktemp -d)" BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-senha-de-teste-do-backup}"; ST="${STORAGE_DIR:-$PWD/storage}"; mkdir -p "$ST"
TMPDB="painel_restore_$$"; # TESTE_ADMIN_URL (opcional): postgres://superusuario:senha@host:5432, sem nome de banco, se o papel do painel não puder criar bancos
BASE_URL="${TESTE_ADMIN_URL:-${DATABASE_URL%/*}}"; ADMIN_URL="$BASE_URL/postgres"; DEST_URL="$BASE_URL/$TMPDB"; DEST_ST="$(mktemp -d)"
cleanup() { psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $TMPDB" >/dev/null 2>&1 || true; rm -rf "$BACKUP_DIR" "$DEST_ST"; }; trap cleanup EXIT
bash scripts/backup.sh >/dev/null
DUMP=$(ls "$BACKUP_DIR"/painel-*.dump.enc); ARQ=$(ls "$BACKUP_DIR"/arquivos-*.tar.gz.enc)
( cd "$BACKUP_DIR" && sha256sum -c SHA256-*.txt >/dev/null ) && echo "  ✔ checksums conferem"
grep -q "PGDMP" "$DUMP" && { echo "  ✖ backup NÃO está cifrado"; exit 1; } || echo "  ✔ backup cifrado (não é legível sem a senha)"
psql "$ADMIN_URL" -qc "CREATE DATABASE $TMPDB"
bash scripts/restaurar.sh "$DUMP" "$ARQ" "$DEST_URL" "$DEST_ST" >/dev/null && echo "  ✔ restauração concluída"
for t in usuarios empresas arquivos movimentacoes informes pendencias auditoria; do
  a=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM $t"); b=$(psql "$DEST_URL" -tAc "SELECT count(*) FROM $t")
  [ "$a" = "$b" ] && echo "  ✔ $t: $a registro(s) iguais" || { echo "  ✖ $t difere: origem=$a restaurado=$b"; exit 1; }
done
fa=$(cd "$ST" && find . -type f | sort | xargs -r sha256sum | sha256sum); fb=$(cd "$DEST_ST" && find . -type f | sort | xargs -r sha256sum | sha256sum)
[ "$fa" = "$fb" ] && echo "  ✔ arquivos idênticos ($(cd "$ST" && find . -type f | wc -l) arquivo(s))" || { echo "  ✖ arquivos diferem"; exit 1; }
echo "Backup e restauração verificados."
