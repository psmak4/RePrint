#!/usr/bin/env bash
# Logical backup of a RePrint database (PRD §11): usage `scripts/backup.sh <database-url> <dump-file>`.
# Writes a compressed custom-format dump that scripts/restore.sh restores. Use a direct (non-pooled)
# URL: pg_dump does not work through a connection pooler. Set PG_RUN to run the Postgres tools
# somewhere else, for example `PG_RUN="docker compose exec -T postgres"` (the dump still lands on
# this machine). The dump contains personal data: never commit it or leave it on shared disks.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <database-url> <dump-file>" >&2
  exit 2
fi
url="$1"
out="$2"

# PG_RUN is deliberately split into words.
# shellcheck disable=SC2086
${PG_RUN:-} pg_dump --format=custom --no-owner --no-privileges --dbname "$url" > "$out.partial"

# Prove the file is a readable archive before calling it a backup.
# shellcheck disable=SC2086
${PG_RUN:-} pg_restore --list < "$out.partial" > /dev/null
mv "$out.partial" "$out"
echo "backup written: $out ($(wc -c < "$out" | tr -d ' ') bytes)"
