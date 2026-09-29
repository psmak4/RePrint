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

_No open blockers._
