# Self-hosted CI runner (fallback, not in use)

> **Status (2026-10-01):** retired. CI runs on GitHub-hosted runners while the repo is public (D-119). Use this setup again only if the repo is private and Actions minutes run out. **Never register a self-hosted runner on a public repo:** a pull request from a fork could run code on your machine. To re-enable, register the runner as below and change every `runs-on` in `.github/workflows/ci.yml` to `[self-hosted, reprint-ci]`.

CI ran on a self-hosted GitHub Actions runner on the owner's Mac (D-113). GitHub-hosted minutes for this private repo on the free plan ran out; self-hosted runners cost nothing and keep the repo private.

## Requirements

- macOS on Apple silicon with Docker Desktop running (integration tests, gitleaks, and the e2e stack use Docker).
- The machine must be awake for CI to run. Queued jobs wait up to 24 hours for the runner.

## One-time setup (owner)

1. On GitHub, open **Settings → Actions → Runners → New self-hosted runner** for `psmak4/RePrint` and choose **macOS / ARM64**.
2. Run the download commands it shows in a new folder outside the repo, for example `~/actions-runner-reprint`.
3. Run the `./config.sh --url … --token …` command it shows, and when asked:
   - runner group: press Enter (Default);
   - name: press Enter or type `reprint-mac`;
   - **additional labels: `reprint-ci`** (the workflow selects the runner by this label);
   - work folder: press Enter (`_work`).
4. Start it: `./run.sh` in a terminal that stays open, or as a background service that also starts at login: `./svc.sh install && ./svc.sh start`.

The registration token is short-lived and shown only on that GitHub page; don't paste it anywhere else.

## How CI stays isolated on a shared machine

- Every job runs in the runner's own `_work` folder, not in your checkout.
- The `e2e` job starts its own Compose project, `reprint-ci`, on shifted ports (Postgres 15432, Redis 16379, Mailpit 11025/18025) from `docker-compose.ci.yml`, runs the apps on 15173/13000, and removes the stack and its volumes afterwards. Your local `reprint` stack on the default ports is never touched.
- Integration tests use Testcontainers on random ports.
- One runner runs one job at a time, so a PR's nine jobs run one after another (roughly 10–20 minutes per PR).

## Checking on it

- **Settings → Actions → Runners** shows the runner as Idle, Active, or Offline.
- A PR whose checks stay "Queued" usually means the runner is offline or the Mac is asleep.
- If you run it as a service: `./svc.sh status` in the runner folder; `./svc.sh stop` to pause CI.

## Going back to GitHub-hosted runners

If the repo becomes public, or Actions minutes are available again, change every `runs-on` in `.github/workflows/ci.yml` to `ubuntu-latest`. The e2e job's isolated ports work either way.
