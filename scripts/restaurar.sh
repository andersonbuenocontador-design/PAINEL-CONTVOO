#!/usr/bin/env bash
# Restaura um backup. Uso: scripts/restaurar.sh <painel-*.dump[.enc]> <arquivos-*.tar.gz[.enc]> <DATABASE_URL_DESTINO> <PASTA_STORAGE_DESTINO>
# O banco de destino deve existir e estar VAZIO. Se os arquivos foram cifrados, defina BACKUP_PASSPHRASE.
set -euo pipefail
DUMP="${1:?informe o .dump}"; ARQ="${2:?informe o .tar.gz}"; DEST_DB="${3:?informe a DATABASE_URL de destino}"; DEST_ST="${4:?informe a pasta de storage de destino}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
dec() { if [[ "$1" == *.enc ]]; then openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$1" -out "$2"; else cp "$1" "$2"; fi; }
dec "$DUMP" "$TMP/b.dump"; dec "$ARQ" "$TMP/a.tar.gz"
pg_restore --no-owner --exit-on-error --dbname="$DEST_DB" "$TMP/b.dump"
mkdir -p "$DEST_ST"; tar -xzf "$TMP/a.tar.gz" -C "$DEST_ST"
echo "Restauração concluída em $DEST_ST e no banco informado."
