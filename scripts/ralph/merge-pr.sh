#!/usr/bin/env bash
# Merge gate for the build loop. The repo is private on a free GitHub plan, so
# branch protection isn't enforced server-side (D-055). This script is the only
# way the loop merges: it squash-merges a PR only when every required check
# listed in docs/ci.md passed on the PR's current head commit.
#
# Usage:   scripts/ralph/merge-pr.sh <pr-number> [--dry-run]
# Exit:    0 merged (or would merge, with --dry-run) · 1 refused · 2 usage error

set -euo pipefail

usage() { echo "usage: $0 <pr-number> [--dry-run]" >&2; exit 2; }
refuse() { echo "merge-pr: REFUSED: $*" >&2; exit 1; }

pr="${1:-}"
[[ "$pr" =~ ^[0-9]+$ ]] || usage
dry_run=0
case "${2:-}" in
  "") ;;
  --dry-run) dry_run=1 ;;
  *) usage ;;
esac

cd "$(git rev-parse --show-toplevel)"

# Required check names are the backticked first column of the table under
# "## Required checks" in docs/ci.md, the single source of truth for CI jobs.
required=()
while IFS= read -r name; do
  required+=("$name")
done < <(
  awk '/^## /{in_sec = ($0 == "## Required checks")} in_sec' docs/ci.md |
    sed -nE 's/^\| `([^`]+)` \|.*/\1/p'
)
((${#required[@]} > 0)) || refuse "no required checks found under '## Required checks' in docs/ci.md"

info="$(gh pr view "$pr" --json state,isDraft,baseRefName,headRefOid,mergeable)"
state="$(jq -r .state <<<"$info")"
draft="$(jq -r .isDraft <<<"$info")"
base="$(jq -r .baseRefName <<<"$info")"
head_sha="$(jq -r .headRefOid <<<"$info")"
mergeable="$(jq -r .mergeable <<<"$info")"

[[ "$state" == "OPEN" ]] || refuse "PR #$pr is $state, not OPEN"
[[ "$draft" == "false" ]] || refuse "PR #$pr is a draft"
[[ "$base" == "main" ]] || refuse "PR #$pr targets '$base', not main"
[[ "$mergeable" == "MERGEABLE" ]] || refuse "PR #$pr is not mergeable ($mergeable); rebase on main first"

# gh reports the checks for the PR's head commit. It exits non-zero while
# checks are pending or failing, so read the JSON and judge it here.
checks="$(gh pr checks "$pr" --json name,bucket 2>/dev/null || true)"
[[ -n "$checks" ]] || refuse "PR #$pr reports no checks yet"

failing="$(jq -r '[.[] | select(.bucket == "fail" or .bucket == "cancel") | .name] | unique | join(", ")' <<<"$checks")"
[[ -z "$failing" ]] || refuse "failing checks on PR #$pr: $failing"

for name in "${required[@]}"; do
  bucket="$(jq -r --arg n "$name" '[.[] | select(.name == $n) | .bucket] | if length == 0 then "missing" elif all(. == "pass") then "pass" else (map(select(. != "pass")) | first) end' <<<"$checks")"
  [[ "$bucket" == "pass" ]] || refuse "required check '$name' is $bucket on PR #$pr"
done

echo "merge-pr: PR #$pr at ${head_sha:0:7} passed all required checks: ${required[*]}"
if ((dry_run)); then
  echo "merge-pr: dry run, not merging"
  exit 0
fi

# --match-head-commit makes GitHub refuse the merge if a new commit landed after the checks above.
gh pr merge "$pr" --squash --delete-branch --match-head-commit "$head_sha"

final="$(gh pr view "$pr" --json state --jq .state)"
[[ "$final" == "MERGED" ]] || refuse "merge command ran but PR #$pr is $final"
echo "merge-pr: PR #$pr MERGED"
