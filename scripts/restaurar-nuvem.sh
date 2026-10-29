#!/usr/bin/env bash
# Restaura um backup da nuvem num projeto Supabase NOVO/VAZIO. Uso:
#   BACKUP_PASSPHRASE=... DATABASE_URL=<destino> SUPABASE_URL=<destino> SUPABASE_SECRET_KEY=<destino> \
#   scripts/restaurar-nuvem.sh painel-*.dump.enc arquivos-*.tar.gz.enc
# Depois: npm run migrate (aplica o que faltar) e aponte o Render para o novo projeto.
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:?painel-*.dump.enc}"; ARQ="${2:?arquivos-*.tar.gz.enc}"; : "${DATABASE_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}" "${BACKUP_PASSPHRASE:?}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; mkdir -p "$TMP/docs"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$DUMP" -out "$TMP/b.dump"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$ARQ" | tar -xz -C "$TMP/docs"
docker run --rm -v "$TMP:/in" -e U="$DATABASE_URL" postgres:17 sh -c 'pg_restore -l /in/b.dump | grep -v -E " SCHEMA - public | COMMENT - SCHEMA public " > /tmp/lista && pg_restore -L /tmp/lista --no-owner --no-privileges --exit-on-error --dbname="$U" /in/b.dump'  # o esquema public já existe no destino
npx tsx -e "import('./src/lib/storage.ts').then(m => m.prepararArmazenamento()).then(console.log)"
npx tsx scripts/documentos-nuvem.ts enviar "$TMP/docs"
echo "Restauração concluída."
