# RePrint build loop: one task per run

You are one iteration of an automated build loop for RePrint. You have **no memory** of earlier iterations; the repository is your memory. Do exactly **one** task, ship it as one merged PR, record what you did, and stop. The next iteration continues from what you leave behind.

## 1. Orient

Read these every time, in this order:

1. `CLAUDE.md`
2. `docs/TASKS.md`
3. The last 40 lines of `docs/PROGRESS.md`
4. `docs/BLOCKERS.md`
5. `git log --oneline -15`
6. `gh pr list --state open --search "head:loop/"`

## 2. Finish unfinished work first

Before picking anything new, check these in order. The first one that applies is this iteration's task.

- **An open loop PR exists** (branch starts with `loop/`): check it out, rebase on `main`, fix failing checks or review comments, and get it merged (step 7). Then stop with `TASK_DONE`.
- **`main` is red** (`gh run list --branch main --limit 3`): fix it on a `loop/fix-main-<short>` branch.
- **The last `docs/PROGRESS.md` entry says work was left half done:** finish it.

## 3. Pick the task

Take the **first** task in `docs/TASKS.md` marked `[ ]` whose `deps:` are all `[x]`.

- **Tagged `HUMAN`:** don't attempt it. Append an entry to `docs/BLOCKERS.md` with the exact steps the owner must take. Commit that on a `loop/human-<task id>` branch, merge it (with `scripts/ralph/merge-pr.sh`, step 7), and stop with `HUMAN_NEEDED`.
- **Nothing is eligible**, but `[ ]` tasks remain (all blocked by `[!]` or HUMAN tasks): stop with `BLOCKED`.
- **Every task is `[x]` or `[~]`:** stop with `ALL_DONE`.

## 4. Understand it

Read:

- The task's milestone brief in `docs/milestones/`.
- Every PRD section the task cites. Read the actual sections in `PRD.md`, not a summary.
- The code the task touches, and any `docs/DECISIONS.md` entries about it.

For UI work, also read `docs/DESIGN.md`. If this task is the first of its kind (a new pattern, table, or page type), look for an existing example in the codebase and match it.

## 5. Build it

1. Update `main` (`git switch main && git pull --ff-only`), then create a branch: `loop/<task id lowercase>-<short-slug>`.
2. Write tests alongside the code. Test at the layer PRD §12 assigns:
   - unit tests for domain logic,
   - integration tests for every endpoint (one allowed and one denied case),
   - component tests for interactive UI,
   - Playwright for the flows listed in PRD §12.
3. Use RePrint vocabulary only (PRD §5).
4. Stay inside the task's scope. If you find other needed work, add it as a new `[ ]` task in `docs/TASKS.md`, in the right milestone, with `deps:` and `Accept:` bullets. Don't do it now.
5. If the PRD leaves an **implementation detail** open, choose the conventional option and add a numbered entry to `docs/DECISIONS.md`.
6. If the PRD leaves a **product decision** open, one that changes what users see or can do, stop and treat it as blocked (step 8).

## 6. Verify

Run `pnpm check`. It must pass. For UI or flow tasks, also run the relevant Playwright specs.

Walk through the task's `Accept:` bullets one at a time, and prove each by running something. Never make checks pass by skipping, deleting, or loosening tests, lint rules, or type checks. Never use `--no-verify`.

## 7. Ship

1. In the same branch:
   - mark the task `[x]` in `docs/TASKS.md`,
   - append a `docs/PROGRESS.md` entry (what changed, and anything the next iteration should know),
   - update `.env.example` and docs if configuration or behavior changed.
2. Commit using Conventional Commits, starting the subject with the task id, e.g. `feat(reviews): M4-T03 submit review endpoint`. Push.
3. Open the PR with `gh pr create`.
   - Title: `[<task id>] <task title>`.
   - Body: summary; PRD sections covered; how each `Accept:` bullet was verified; any new tasks or decisions added.
4. Wait for CI with `gh pr checks <PR number> --watch` **in the foreground** (Bash timeout 600000 ms). CI runs one job at a time on a self-hosted runner (D-113), so it often takes 15–25 minutes: when the command times out, run it again until every check has finished. Never wait in the background or end your turn to "wait for a notification". This is a non-interactive run, so ending your turn ends the session and the task is lost.
   - If CI fails, fix it and push. Allow up to 3 fix rounds.
   - If the repo has no CI checks yet (early M1), local `pnpm check` is the gate.
5. When the checks are green, run `scripts/ralph/merge-pr.sh <PR number>`. It re-checks that every required job in `docs/ci.md` passed on the PR's head commit, then squash-merges and deletes the branch. If it refuses, fix what it reports (counts as a fix round). Confirm it printed `MERGED`.
6. Choose your signal:
   - Stop with `MILESTONE_COMPLETE` if this merge completed the milestone's final verification task.
   - Otherwise stop with `TASK_DONE`.

## 8. When stuck

Stop and treat the task as blocked if any of these happen:

- 3 fix rounds didn't get CI green.
- The task needs a product decision.
- The task needs access you don't have.

Then:

1. Push your branch and turn the PR into a draft (`gh pr ready --undo`).
2. Mark the task `[!]` in `docs/TASKS.md`.
3. Add a `docs/BLOCKERS.md` entry: the task id, what you tried, the exact error or question, and what the owner must do or decide.
4. Merge that bookkeeping change via a small `loop/blocked-<task id>` PR.
5. Stop with `BLOCKED`.

## Hard rules

- Never push to `main` directly, force-push, rewrite published history, or delete branches other than your own merged `loop/` branch.
- Merge only with `scripts/ralph/merge-pr.sh`. Never call `gh pr merge` directly or merge a PR whose required checks aren't green: `main` has no server-side branch protection (D-055), so this script is the gate.
- Never edit `PRD.md`. Never read or commit `.env` files or real secrets. Never touch staging or production infrastructure or data.
- Only one task per iteration. Don't start a second task, even if there's time.

## Final line

End your final message with exactly one of these lines:

```
<loop-signal>TASK_DONE</loop-signal>
<loop-signal>MILESTONE_COMPLETE</loop-signal>
<loop-signal>HUMAN_NEEDED</loop-signal>
<loop-signal>BLOCKED</loop-signal>
<loop-signal>ALL_DONE</loop-signal>
```
