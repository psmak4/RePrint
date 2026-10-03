#!/usr/bin/env bash
# 30-second, low-rate run of load/k6/mixed-read-heavy.js against the local stack (M8-T08).
# Uses the k6 binary when installed, and the grafana/k6 Docker image otherwise.
# Start the API first (`pnpm dev`, or the e2e stack) with the seeded database (`pnpm db:seed`).
set -euo pipefail

cd "$(dirname "$0")/.."

BASE_URL="${BASE_URL:-http://localhost:3000}"
# The seeded Members share one development password (docs/local-dev.md).
LOAD_MEMBERS="${LOAD_MEMBERS:-member1@example.test:reprint-dev-password,member2@example.test:reprint-dev-password}"
# The default is under the anonymous read limit of 300 per minute per IP (PRD §11).
RATE="${RATE:-3}"
DURATION="${DURATION:-30s}"
MAX_VUS="${MAX_VUS:-20}"

if command -v k6 >/dev/null 2>&1; then
  exec k6 run -e "BASE_URL=${BASE_URL}" -e "LOAD_MEMBERS=${LOAD_MEMBERS}" -e "RATE=${RATE}" \
    -e "DURATION=${DURATION}" -e "MAX_VUS=${MAX_VUS}" load/k6/mixed-read-heavy.js
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "load:smoke needs k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/) or Docker." >&2
  exit 1
fi

# From inside the container, the host's localhost is host.docker.internal.
CONTAINER_URL="${BASE_URL/localhost/host.docker.internal}"
CONTAINER_URL="${CONTAINER_URL/127.0.0.1/host.docker.internal}"
exec docker run --rm -i \
  --add-host=host.docker.internal:host-gateway \
  -v "$PWD/load/k6:/scripts:ro" \
  -e "BASE_URL=${CONTAINER_URL}" -e "LOAD_MEMBERS=${LOAD_MEMBERS}" -e "RATE=${RATE}" \
  -e "DURATION=${DURATION}" -e "MAX_VUS=${MAX_VUS}" \
  grafana/k6:latest run /scripts/mixed-read-heavy.js
