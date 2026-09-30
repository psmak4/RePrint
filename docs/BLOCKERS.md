# Blockers

Where the loop tells the owner what it needs. The loop appends an entry when it reaches a `HUMAN` task or blocks on a task (`[!]`). The owner resolves it, then marks the task `[x]` (HUMAN done) or changes `[!]` back to `[ ]` in `docs/TASKS.md`, adds a `Resolved:` line to the entry, and re-runs `scripts/ralph/ralph.sh`.

Entry format:

```
### <YYYY-MM-DD> · <task id> · HUMAN | BLOCKED
- Task: <task title from docs/TASKS.md>
- Tried: <what the loop did, or "n/a, human task">
- Error / question: <exact error output or the product question>
- Owner must: <numbered, exact steps or the decision needed>
- Resolved: <date and what was done; the owner fills this in>
```

---

### 2026-09-29 · M1-T03 · HUMAN
- Task: Enable branch protection on `main` requiring the CI checks
- Tried: n/a, human task. Confirmed the latest `main` CI run (36519713048) is green, so all six required job names below have reported at least once and can be selected.
- Error / question: The loop has no admin access to repository settings. Required checks are the six jobs in `docs/ci.md`: `lint`, `typecheck`, `unit`, `build`, `gitleaks`, `audit`.
- Owner must:
  1. Open https://github.com/psmak4/RePrint/settings/branches, then **Add branch protection rule** (or **Add classic branch protection rule**) for the branch name pattern `main`.
  2. Tick **Require a pull request before merging**. Set required approvals to 0 so the loop can merge its own PRs.
  3. Tick **Require status checks to pass before merging** and **Require branches to be up to date before merging**. Search for and add each of `lint`, `typecheck`, `unit`, `build`, `gitleaks`, and `audit`.
  4. Leave **Allow force pushes** and **Allow deletions** unticked (this disables both). Save the rule.
  5. Open https://github.com/psmak4/RePrint/settings. Under **Pull Requests**, make sure **Allow squash merging** is ticked and tick **Automatically delete head branches**.
  6. Mark M1-T03 `[x]` in `docs/TASKS.md` (through a PR, since `main` is now protected), fill in `Resolved:` below, and re-run `scripts/ralph/ralph.sh`.
  - CLI alternative for steps 1–5 (needs an admin token):
    ```
    gh api -X PUT repos/psmak4/RePrint/branches/main/protection --input - <<'EOF'
    {"required_status_checks":{"strict":true,"contexts":["lint","typecheck","unit","build","gitleaks","audit"]},
     "enforce_admins":false,
     "required_pull_request_reviews":{"required_approving_review_count":0},
     "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
    EOF
    gh api -X PATCH repos/psmak4/RePrint -F allow_squash_merge=true -F delete_branch_on_merge=true
    ```
  - Check: `gh api repos/psmak4/RePrint/branches/main/protection --jq '.required_status_checks.contexts'` lists the six jobs.
- Resolved: 2026-09-29. Branch protection and rulesets aren't enforced on private repos on the free GitHub plan, and the owner isn't upgrading. M1-T03 is marked `[~]`; the loop now merges only through `scripts/ralph/merge-pr.sh`, which requires every check in `docs/ci.md` to pass (D-055). Squash merging and "Automatically delete head branches" still need to be on in Settings → General (they work on the free plan).

### 2026-09-30 · M3-T21 · CI cannot start
- Task: M3-T21 Local seed (PR #66, branch `loop/m3-t21-catalog-seed`). The work is complete and `pnpm check` passes locally.
- Tried: pushed the branch and opened the PR; all 9 CI jobs failed within 2 to 5 seconds. `main`'s CI run for #65 also never finished (pending, then cancelled runs).
- Error / question: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings." `scripts/ralph/merge-pr.sh` correctly refuses to merge without green required jobs (D-055), so the loop can't ship.
- Owner must:
  1. Open https://github.com/settings/billing (or the organization's Billing & plans) and fix the failed payment or raise the Actions spending limit.
  2. Re-run the failed jobs on PR #66 (`gh run rerun 36736210952 --failed`), or push an empty commit.
  3. Re-run `scripts/ralph/ralph.sh`; the next iteration finishes PR #66 (step 2 of the loop prompt) and merges it.
- Resolved: <date and what was done; the owner fills this in>

