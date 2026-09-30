#!/usr/bin/env bash
# Fail when Open Library vocabulary appears outside the adapter directory (PRD §5.2, CLAUDE.md "Vocabulary").
# Matches OLIDs (OL123W), Open Library API paths, and identifiers such as workId or work_key. Plain
# English uses of "work" are fine, so the pattern only looks for the identifier forms.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

pattern='\bolid|\bOL[0-9]+[AMW]\b|/works/|\bwork(s)?(_|[A-Z])'
dirs=(apps/api/src apps/web/app packages/shared/src packages/db/src packages/email packages/ui/src)
existing=()
for dir in "${dirs[@]}"; do [ -d "$dir" ] && existing+=("$dir"); done

if hits="$(grep -rEn --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=open-library -e "$pattern" "${existing[@]}")"; then
  echo "Open Library vocabulary found outside apps/api/src/catalog/sources/open-library/:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "vocabulary: no Source vocabulary outside the adapter directory"
