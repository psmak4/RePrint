# RePrint build loop

This folder runs the automated build. Each **iteration** is a fresh `claude -p` session that:

1. reads `CLAUDE.md` and `docs/TASKS.md`,
2. does the next task,
3. opens a PR, waits for CI, merges it,
4. logs what it did to `docs/PROGRESS.md`,
5. exits with a signal.

Because every iteration starts with fresh context, the repo files are the loop's only memory.

## One-time setup

1. **Install tools:** Node 24, pnpm, Docker, `jq`, the GitHub CLI (`gh auth login`), and Claude Code (`claude auth login`).
2. **The setup session** has already added this folder, `.claude/settings.json`, and the build plan in one bootstrap PR.
3. **Review the bootstrap PR carefully.** It's the whole build plan. Edit anything you disagree with, answer the "Questions for the owner" in `docs/DECISIONS.md`, then merge.

## Running

```bash
scripts/ralph/ralph.sh                     # default: up to 25 tasks, pauses after each milestone
MAX_ITERATIONS=5 scripts/ralph/ralph.sh    # a short supervised run
touch .ralph/STOP                          # graceful stop before the next iteration
```

Run it inside `tmux` or `screen` so it survives closing your terminal. Logs go to `.ralph/logs/` (git-ignored). Each log is the session's full `stream-json` transcript.

## When the loop stops

| Exit | Meaning | What to do |
| --- | --- | --- |
| 0 · milestone complete | A milestone's verification task merged | Try the milestone on staging, file fixes as new tasks in `docs/TASKS.md`, re-run |
| 0 · all done | Every task is `[x]` or `[~]` | Work through PRD §3 milestone 8 launch items |
| 2 · human needed / blocked | A `HUMAN` task or a blocker | Read `docs/BLOCKERS.md`, do the step or make the decision, mark the task `[x]` (or change `[!]` back to `[ ]`), re-run |
| 3 · two failed iterations | Crashes or turn limits | Read the last two logs and any open `loop/` PRs |
| 1 | Preflight failed | Read the error |

## Steering

- **Change what gets built:** edit `docs/TASKS.md`. Add, reorder, split, or mark tasks `[~]`. The next iteration picks it up.
- **Change how it's built:** edit `CLAUDE.md`. Recurring mistakes belong here.
- **Change the loop's procedure:** edit `scripts/ralph/PROMPT.md`.
- **Review PRs after the fact:** every change is a squash-merged PR with its task ID in the title, so it's easy to revert.

## Safety notes

- **Permissions:**
    - Iterations run with `--permission-mode auto` and `--permission-prompts none`, together with the allow and deny lists in `.claude/settings.json`. Anything that would need a prompt is denied, not asked.
    - For stricter behavior, `PERMISSION_MODE=dontAsk` allows only the allow list.
- **Where to run it:** preferably a dedicated machine, VM, or dev container, not the laptop that holds your production credentials.
- **Access:** the loop never needs production or staging secrets. Keep them in Render, Netlify, and GitHub settings only.
- **Merge gate:** the repo is private on a free GitHub plan, so branch protection isn't enforced (D-055). Instead the loop merges only through `scripts/ralph/merge-pr.sh`, which refuses unless every required check in `docs/ci.md` passed on the PR's head commit; `.claude/settings.json` denies calling `gh pr merge` directly. This guards the loop, not people: anyone with write access can still merge by hand, so merge red PRs only on purpose. If the repo later becomes public or moves to a paid plan, enable branch protection too.
- **Usage:** a full build is many long sessions. Watch usage, and keep `MAX_ITERATIONS` modest at first. Start with 3 to 5 iterations and read the PRs before letting it run longer.
