#!/usr/bin/env bash
# Backup and restore round trip against the local database (M8-T11; `pnpm backup:drill`, CI job
# `restore-drill`). Dumps DATABASE_URL with scripts/backup.sh, restores it into a throwaway scratch
# database with scripts/restore.sh, and fails unless every table has the same row count.
# Needs a migrated and seeded database (`pnpm db:migrate && pnpm db:seed`).
# With no Postgres 18 client tools installed, it runs them inside the Compose postgres container.
set -euo pipefail

cd "$(dirname "$0")/.."

url="${DATABASE_URL:-postgres://reprint:reprint@localhost:5432/reprint}"
export PG_RUN="${PG_RUN:-}"

if [ -z "$PG_RUN" ]; then
  major="$(pg_dump --version 2>/dev/null | sed -E 's/[^0-9]*([0-9]+).*/\1/' || true)"
  if [ -z "${major:-}" ] || [ "$major" -lt 18 ]; then
    if ! command -v docker >/dev/null 2>&1; then
      echo "restore-drill: needs Postgres 18 client tools or Docker" >&2
      exit 1
    fi
    echo "restore-drill: no Postgres 18 client tools; using the Compose postgres container"
    export PG_RUN="${COMPOSE:-docker compose} exec -T postgres"
    url="postgres://reprint:reprint@localhost:5432/reprint" # as seen from inside the container
  fi
fi

base="${url%/*}"
scratch="restore_drill_$$"
scratch_url="$base/$scratch"
work="$(mktemp -d)"

# shellcheck disable=SC2086
admin() { ${PG_RUN:-} psql --no-psqlrc --set ON_ERROR_STOP=1 --dbname "$url" --command "$1" > /dev/null; }
cleanup() {
  admin "drop database if exists $scratch" || true
  rm -rf "$work"
}
trap cleanup EXIT

counts() {
  # shellcheck disable=SC2086
  ${PG_RUN:-} psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --dbname "$1" --command \
    "select table_schema || '.' || table_name || E'\t' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
     from information_schema.tables
     where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
     order by 1"
}

counts "$url" > "$work/source.tsv"
if ! awk -F'\t' '$1 == "public.books" && $2 > 0 { found = 1 } END { exit !found }' "$work/source.tsv"; then
  echo "restore-drill: the source has no Books. Run 'pnpm db:seed' first." >&2
  exit 1
fi

bash scripts/backup.sh "$url" "$work/drill.dump"
admin "create database $scratch"
bash scripts/restore.sh "$work/drill.dump" "$scratch_url" > "$work/restored.tsv"

if diff "$work/source.tsv" "$work/restored.tsv"; then
  echo "restore-drill: OK, $(wc -l < "$work/source.tsv" | tr -d ' ') tables restored with identical row counts"
else
  echo "restore-drill: FAILED, the restored row counts differ from the source (diff above)" >&2
  exit 1
fi
