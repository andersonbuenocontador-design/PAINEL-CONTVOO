#!/usr/bin/env bash
# Backup do banco (pg_dump) e dos arquivos (storage). Uso: npm run backup
# Variáveis: DATABASE_URL (obrig.), STORAGE_DIR (padrão ./storage), BACKUP_DIR (padrão ./backups), BACKUP_KEEP (padrão 14),
#            BACKUP_PASSPHRASE (opcional, mas RECOMENDADO: cifra os arquivos com AES-256; guarde a senha fora do servidor).
set -euo pipefail
cd "$(dirname "$0")/.."
# .env.local só preenche o que ainda não veio do ambiente (ex.: testar-backup define BACKUP_DIR/BACKUP_PASSPHRASE temporários)
_pre_BD="${BACKUP_DIR-}"; _pre_BP="${BACKUP_PASSPHRASE-}"; _pre_ST="${STORAGE_DIR-}"; _pre_DB="${DATABASE_URL-}"
[ -f .env.local ] && { set -a; . ./.env.local; set +a; }
[ -n "$_pre_BD" ] && BACKUP_DIR="$_pre_BD"; [ -n "$_pre_BP" ] && BACKUP_PASSPHRASE="$_pre_BP"; [ -n "$_pre_ST" ] && STORAGE_DIR="$_pre_ST"; [ -n "$_pre_DB" ] && DATABASE_URL="$_pre_DB"
export BACKUP_DIR BACKUP_PASSPHRASE STORAGE_DIR DATABASE_URL 2>/dev/null || true
: "${DATABASE_URL:?DATABASE_URL não definida}"
STORAGE_DIR="${STORAGE_DIR:-$PWD/storage}"; BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"; KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"; TS=$(date +%Y%m%d-%H%M%S)
DUMP="$BACKUP_DIR/painel-$TS.dump"; ARQ="$BACKUP_DIR/arquivos-$TS.tar.gz"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$DUMP"
if [ -d "$STORAGE_DIR" ]; then tar -czf "$ARQ" -C "$STORAGE_DIR" .; else tar -czf "$ARQ" --files-from /dev/null; fi
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  for f in "$DUMP" "$ARQ"; do openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$f" -out "$f.enc" && rm -f "$f"; done
  DUMP="$DUMP.enc"; ARQ="$ARQ.enc"
fi
( cd "$BACKUP_DIR" && sha256sum "$(basename "$DUMP")" "$(basename "$ARQ")" > "SHA256-$TS.txt" )
chmod 600 "$BACKUP_DIR"/*"$TS"* 
# rotação: mantém só os BACKUP_KEEP conjuntos mais recentes
ls -1 "$BACKUP_DIR"/SHA256-*.txt 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | while read -r s; do t=${s##*SHA256-}; t=${t%.txt}; rm -f "$BACKUP_DIR"/painel-"$t".dump* "$BACKUP_DIR"/arquivos-"$t".tar.gz* "$s"; done
echo "Backup concluído: $DUMP e $ARQ"
