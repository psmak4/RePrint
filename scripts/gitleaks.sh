#!/usr/bin/env bash
# Scan the full git history for committed secrets (PRD §11).
# Uses a local `gitleaks` binary when one is installed, otherwise the pinned Docker image.
# CI and `pnpm check` both run this script, so they scan the same way.
set -euo pipefail

GITLEAKS_VERSION="v8.30.1"
repo_root="$(git rev-parse --show-toplevel)"

if command -v gitleaks >/dev/null 2>&1; then
  exec gitleaks git --no-banner --redact "$repo_root"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "gitleaks: install gitleaks or Docker to run the secret scan" >&2
  exit 1
fi

exec docker run --rm -v "$repo_root:/repo" "ghcr.io/gitleaks/gitleaks:${GITLEAKS_VERSION}" \
  git --no-banner --redact /repo
