#!/usr/bin/env bash
# RePrint build loop: runs one fresh Claude Code session per task until the
# task list is done, a milestone completes, or a human is needed.
#
# Usage:   scripts/ralph/ralph.sh
# Stop:    touch .ralph/STOP   (the loop exits before the next iteration)
#
# Tunables (environment variables):
#   MAX_ITERATIONS     how many tasks to attempt this run          (default 25)
#   MAX_TURNS          agentic turns allowed per iteration         (default 300)
#   MODEL              model alias or full id                      (default opus)
#   PERMISSION_MODE    auto | dontAsk | acceptEdits                (default auto)
#   STOP_ON_MILESTONE  1 = pause for owner review after each milestone (default 1)
#   MAX_BUDGET_USD     per-iteration spend cap, API-key billing only (default unset)

set -euo pipefail

MAX_ITERATIONS="${MAX_ITERATIONS:-25}"
MAX_TURNS="${MAX_TURNS:-300}"
MODEL="${MODEL:-opus}"
PERMISSION_MODE="${PERMISSION_MODE:-auto}"
STOP_ON_MILESTONE="${STOP_ON_MILESTONE:-1}"
MAX_BUDGET_USD="${MAX_BUDGET_USD:-}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PROMPT_FILE="scripts/ralph/PROMPT.md"
STATE_DIR=".ralph"
LOG_DIR="$STATE_DIR/logs"
mkdir -p "$LOG_DIR"

log() { printf '[ralph %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# ---- preflight --------------------------------------------------------------
for cmd in claude gh git jq pnpm docker; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is not installed or not on PATH"
done
gh auth status >/dev/null 2>&1 || die "GitHub CLI is not authenticated (run: gh auth login)"
docker info >/dev/null 2>&1 || die "Docker is not running (integration tests need it)"
[[ -f "$PROMPT_FILE" ]] || die "missing $PROMPT_FILE"
[[ -f docs/TASKS.md ]] || die "missing docs/TASKS.md: run the bootstrap prompt and merge its PR first"
rm -f "$STATE_DIR/STOP"

remaining_tasks() { grep -cE '^- \[ \] ' docs/TASKS.md || true; }

build_args() {
  ARGS=(-p "$(cat "$PROMPT_FILE")"
        --model "$MODEL"
        --permission-mode "$PERMISSION_MODE"
        --permission-prompts none
        --max-turns "$MAX_TURNS"
        --output-format stream-json
        --verbose)
  if [[ -n "$MAX_BUDGET_USD" ]]; then
    ARGS+=(--max-budget-usd "$MAX_BUDGET_USD")
  fi
}

consecutive_failures=0

for ((i = 1; i <= MAX_ITERATIONS; i++)); do
  if [[ -f "$STATE_DIR/STOP" ]]; then
    log "STOP file found; exiting cleanly."
    rm -f "$STATE_DIR/STOP"
    exit 0
  fi

  # Start every iteration from a clean, up-to-date main.
  if [[ -n "$(git status --porcelain)" ]]; then
    log "Working tree not clean; stashing leftovers from the previous iteration."
    git stash push --include-untracked -m "ralph-leftovers-$(date +%s)" >/dev/null
  fi
  git switch main >/dev/null 2>&1
  git pull --ff-only --quiet

  log "Iteration $i/$MAX_ITERATIONS · $(remaining_tasks) open tasks"
  stamp="$(date '+%Y%m%d-%H%M%S')"
  logfile="$LOG_DIR/$stamp-iter$i.jsonl"

  build_args
  set +e
  claude "${ARGS[@]}" >"$logfile" 2>"${logfile%.jsonl}.stderr.log"
  exit_code=$?
  set -e

  # Read the signal from the session's final result only, never from
  # intermediate messages, so a mention of a signal mid-run can't stop the loop.
  last_result='[split("\n")[] | fromjson? | select(.type == "result")] | last'
  result="$(jq -Rrs "$last_result | .result // empty" "$logfile" 2>/dev/null || true)"
  signal="$(grep -oE '<loop-signal>[A-Z_]+</loop-signal>' <<<"$result" | tail -n 1 | sed -E 's#</?loop-signal>##g' || true)"
  cost="$(jq -Rrs "$last_result | .total_cost_usd // empty" "$logfile" 2>/dev/null || true)"

  log "Session exit $exit_code · signal: ${signal:-none}${cost:+ · cost \$$cost} · log: $logfile"

  case "$signal" in
    TASK_DONE)
      consecutive_failures=0
      ;;
    MILESTONE_COMPLETE)
      consecutive_failures=0
      if [[ "$STOP_ON_MILESTONE" == "1" ]]; then
        log "Milestone complete. Pausing for owner review (see docs/PROGRESS.md)."
        log "Re-run this script to continue with the next milestone."
        exit 0
      fi
      ;;
    HUMAN_NEEDED | BLOCKED)
      log "$signal: the owner needs to act. Latest entries in docs/BLOCKERS.md:"
      git pull --ff-only --quiet || true
      tail -n 30 docs/BLOCKERS.md || true
      exit 2
      ;;
    ALL_DONE)
      log "All tasks complete."
      exit 0
      ;;
    *)
      consecutive_failures=$((consecutive_failures + 1))
      log "No signal (turn limit, crash, or malformed ending). Failure $consecutive_failures/2."
      if ((consecutive_failures >= 2)); then
        log "Two iterations in a row ended without a signal. Stopping so a human can look."
        log "Check the last two logs in $LOG_DIR and any open loop/ PRs."
        exit 3
      fi
      ;;
  esac

  sleep 5
done

log "Reached MAX_ITERATIONS ($MAX_ITERATIONS). Re-run to continue."
