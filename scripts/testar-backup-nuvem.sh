#!/usr/bin/env bash
# Prova que o backup da nuvem SERVE: restaura num PostgreSQL descartável (TESTE_DB_URL) e compara contagens com o banco real
# e o número de documentos com o Storage. Uso (no GitHub Actions, logo após o backup): scripts/testar-backup-nuvem.sh <pasta_do_backup>
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${1:?pasta do backup}"; : "${TESTE_DB_URL:?banco descartável}" "${DATABASE_URL:?}"
DUMP=$(ls "$DIR"/painel-*.dump.enc | sort | tail -1); ARQ=$(ls "$DIR"/arquivos-*.tar.gz.enc | sort | tail -1)
( cd "$DIR" && sha256sum -c "$(ls SHA256-*.txt | sort | tail -1)" >/dev/null ) && echo "  ✔ checksums conferem"
head -c 5 "$DUMP" | grep -q PGDMP && { echo "  ✖ backup NÃO está cifrado"; exit 1; } || echo "  ✔ backup cifrado"
ST=$(mktemp -d); trap 'rm -rf "$ST"' EXIT
psqlx() { docker run --rm --network host -e U="$1" postgres:17 sh -c "psql \"\$U\" -tAc \"$2\""; }
TMPD=$(mktemp -d); openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$DUMP" -out "$TMPD/b.dump"
docker run --rm --network host -v "$TMPD:/in" -e U="$TESTE_DB_URL" postgres:17 sh -c 'pg_restore -l /in/b.dump | grep -v -E " SCHEMA - public | COMMENT - SCHEMA public " > /tmp/lista && pg_restore -L /tmp/lista --no-owner --no-privileges --exit-on-error --dbname="$U" /in/b.dump'  # o esquema public já existe no destino
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$ARQ" | tar -xz -C "$ST"; rm -rf "$TMPD"
echo "  ✔ restauração concluída num banco descartável"
falhou=0
for t in usuarios empresas arquivos movimentacoes informes pendencias auditoria; do
  a=$(psqlx "$DATABASE_URL" "SELECT count(*) FROM public.$t"); b=$(psqlx "$TESTE_DB_URL" "SELECT count(*) FROM public.$t")
  if [ "$a" = "$b" ]; then echo "  ✔ $t: $a registro(s)"; elif [ "$t" = auditoria ] && [ "$b" -le "$a" ]; then echo "  ✔ $t: $b no backup, $a agora (eventos novos)"; elif [ "$b" -lt "$a" ]; then echo "  ⚠ $t: $b no backup, $a agora (uso durante o backup?)"; else echo "  ✖ $t: backup=$b banco=$a"; falhou=1; fi
done
n=$(find "$ST" -type f | wc -l)
echo "  ✔ $n documento(s) no backup"
[ "$falhou" = 0 ] && echo "Backup verificado." || { echo "BACKUP COM PROBLEMA"; exit 1; }
