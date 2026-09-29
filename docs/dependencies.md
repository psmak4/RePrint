# Dependency policy

PRD §8 fixes the stack and pins **major versions**. PRD §11 requires automated dependency updates and a `pnpm audit` gate. Renovate (`renovate.json`) does the updating.

## Rules

- **Majors are pinned.** Renovate never opens a major-version PR (except GitHub Actions, below). Moving a major is a deliberate task: change the PRD §8 table proposal in `docs/DECISIONS.md`, then bump by hand.
- **Minor and patch updates are grouped** into one weekly PR ("all non-major dependencies"), opened before 06:00 UTC on Mondays. The lockfile is refreshed on the same schedule. At most 5 Renovate PRs are open at a time.
- **Drizzle is 0.x**, so its minor releases can break. `drizzle-orm` and `drizzle-kit` minors get their own PR with the `review-carefully` label. Drizzle 1.0 is a manual upgrade once it is stable (PRD §8).
- **GitHub Actions** majors are not in the stack table. They arrive as separate PRs.
- **Docker images** (Postgres 18, Redis 7, Mailpit) and Node 24 follow the same rule: no automatic major changes.
- **TypeScript** stays on 7. Use `typescript@6` only for a tool that needs the old API, and note why in the PR.
- **New dependencies** outside the PRD §8 stack table need a `docs/DECISIONS.md` entry saying why.
- **Renovate PRs** go through the normal gate: `pnpm check` and every required job in `docs/ci.md` must pass before `scripts/ralph/merge-pr.sh` merges them. Never weaken a test to get an update through.
- **Security fixes:** `pnpm audit --audit-level high` fails CI on high and critical findings. Fix by updating the dependency (or a `pnpm.overrides` entry with a DECISIONS note), never by lowering the audit level.

## Checking the config

```
npx --yes --package renovate renovate-config-validator
```

The Renovate GitHub app is installed by the owner in M1-T23.
