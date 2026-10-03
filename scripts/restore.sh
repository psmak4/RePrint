#!/usr/bin/env bash
# Restore a dump made by scripts/backup.sh into a SCRATCH database (PRD §11):
#   scripts/restore.sh <dump-file> <scratch-database-url>
# The target database must already exist, be empty, and have a name starting with `scratch` or
# `restore`. The script never restores over a live database. Set PG_RUN to run the Postgres tools
# somewhere else, for example `PG_RUN="docker compose exec -T postgres"`.
# Prints one `table<TAB>rows` line per table so the result can be compared with the source.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <dump-file> <scratch-database-url>" >&2
  exit 2
fi
dump="$1"
url="$2"

[ -s "$dump" ] || { echo "restore: $dump is missing or empty" >&2; exit 1; }

db="${url##*/}"
db="${db%%\?*}"
case "$db" in
  scratch* | restore*) ;;
  *)
    echo "restore: refusing to restore into '$db'. The database name must start with 'scratch' or 'restore'." >&2
    exit 1
    ;;
esac

# shellcheck disable=SC2086
psql_q() { ${PG_RUN:-} psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --dbname "$url" --command "$1"; }

existing="$(psql_q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema')")"
if [ "$existing" != "0" ]; then
  echo "restore: '$db' already has $existing tables. Restore into an empty database." >&2
  exit 1
fi

# shellcheck disable=SC2086
${PG_RUN:-} pg_restore --exit-on-error --no-owner --no-privileges --dbname "$url" < "$dump"

# Exact row counts for every table, so a restore can be checked against its source.
psql_q "select table_schema || '.' || table_name || E'\t' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
        from information_schema.tables
        where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
        order by 1"
