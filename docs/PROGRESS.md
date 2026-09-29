# Progress log

Append-only. Every loop iteration adds one entry at the **bottom** when its PR merges (and the owner may add entries too). Never edit or delete earlier entries; correct them with a new one. The next iteration reads the last 40 lines, so put anything it must know here: half-finished work, gotchas, new tasks you added, deferred items.

Entry format:

```
### <YYYY-MM-DD> · <task id> · <PR #>
- What changed (2–4 lines total).
- Anything the next iteration should know (or "Nothing to hand off").
```

---

### 2026-09-28 · BOOTSTRAP · #1
- Added the build loop (`scripts/ralph/`), `.claude/settings.json`, `CLAUDE.md`, milestone briefs, `docs/TASKS.md`, `docs/DECISIONS.md`, `.env.example`, `.gitignore`, and `PRD.md` (a Markdown transcription of the PRD PDF).
- No application code yet. The first loop task is M1-T01 (scaffold). Defaults for owner questions are in `docs/DECISIONS.md` (Q1–Q15).

### 2026-09-28 · M1-T01 · #2
- Scaffolded the pnpm 12.6 + Turborepo 2.11 monorepo: `apps/{api,web}`, `packages/{shared,db,email,ui,config}` with placeholder sources, one Vitest smoke test each, shared tsconfig bases and Biome config in `packages/config` (D-053). Root scripts: `build`, `typecheck`, `test:unit`, `lint`, `format`.
- Next iteration: use Node 24 (`nvm use`; the machine default may be older) and pnpm via corepack. `apps/web` is a plain `tsc` placeholder under `app/` until M1-T11 swaps in React Router; `apps/api/src/server.ts` is a placeholder until M1-T07. `pnpm check` doesn't exist yet (M1-T02).
