#!/usr/bin/env bash
# Backup do painel na nuvem: banco do Supabase (só o esquema public, onde ficam os dados do painel) + documentos do Storage,
# cifrados com AES-256 (mesmo formato do scripts/backup.sh, restaurável por scripts/restaurar.sh ou restaurar-nuvem.sh).
# Roda todo dia pelo GitHub Actions (.github/workflows/backup.yml). Precisa de Docker (pg_dump 17, compatível com o Supabase).
# Variáveis: DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY, BACKUP_PASSPHRASE (obrigatória), BACKUP_DIR (padrão ./backups)
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}"
[ "${#BACKUP_PASSPHRASE}" -ge 16 ] || { echo "BACKUP_PASSPHRASE ausente ou curta (mínimo 16 caracteres)"; exit 1; }
OUT="${BACKUP_DIR:-$PWD/backups}"; TS=$(date -u +%Y%m%d-%H%M%S); TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT" "$TMP/docs"
docker run --rm -v "$TMP:/out" -e PGURL="$DATABASE_URL" postgres:17 \
  sh -c 'pg_dump --format=custom --no-owner --no-privileges --schema=public --dbname="$PGURL" --file=/out/painel.dump'
npx tsx scripts/documentos-nuvem.ts baixar "$TMP/docs"
tar -czf "$TMP/arquivos.tar.gz" -C "$TMP/docs" .
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$TMP/painel.dump" -out "$OUT/painel-$TS.dump.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$TMP/arquivos.tar.gz" -out "$OUT/arquivos-$TS.tar.gz.enc"
( cd "$OUT" && sha256sum "painel-$TS.dump.enc" "arquivos-$TS.tar.gz.enc" > "SHA256-$TS.txt" )
echo "Backup concluído: $OUT/*-$TS.*"
