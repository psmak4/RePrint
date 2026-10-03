# Alert runbook (PRD §11)

Alerts go to email and Slack. The app raises some itself (the `system.monitor` job, every minute, reports to Sentry); the rest come from Sentry performance data or the outside uptime monitor. The owner configures each rule below. Without `SENTRY_DSN` nothing is reported (local development).

Monitor events are Sentry messages (level `error`) tagged `alert:<signal>` with fingerprint `alert:<signal>`, so repeats of one signal group into a single issue. Add the extra detail from the event's "Additional data".

| PRD §11 alert | Signal | Where it comes from | Rule the owner configures | First checks |
| --- | --- | --- | --- | --- |
| Error rate over 2% | none (Sentry metric) | Sentry error and transaction counts for the `api` and `web` services | Sentry metric alert: failed transactions / all transactions > 2% over 5 minutes, per environment `production`; action: email + Slack | Sentry issues sorted by recent events; recent deploy |
| p95 latency over target for 10 minutes | none (Sentry metric) | Sentry performance, `transaction.duration` p95 | Sentry metric alert: p95 > 500 ms (pages and Book detail, PRD §11 target) for 10 minutes; action: email + Slack | Slow transactions; database and Redis health on `/v1/ready` |
| Job queue stuck (over 1,000 waiting, or oldest waiting job over 15 minutes) | `queue_stuck` | `system.monitor`, reading BullMQ counts and the oldest waiting job | Sentry issue alert: event tag `alert` equals `queue_stuck`; action: email + Slack | Is the worker running (`worker ready` log)? Redis memory? A failing job retrying forever (`job failed` logs) |
| Source circuit breaker opens | `source_breaker_open` | The Source gateway writes a short-lived Redis mark when its breaker opens; `system.monitor` reads it | Sentry issue alert: tag `alert` equals `source_breaker_open`; action: email + Slack | Open Library status; `SOURCE_TIMEOUT_MS`; the Catalog keeps serving stored Books, only search and refreshes degrade |
| Oldest pending review over 48 hours | `review_queue_stale` | `system.monitor`, reading the oldest `pending` review | Sentry issue alert: tag `alert` equals `review_queue_stale`; action: email + Slack | `/admin/moderation` queue; add Moderators |
| Source usage over 70% of the limit for an hour (PRD §6) | `source_usage_high` | `system.monitor`, averaging the per-second Source request counters over the last hour against `SOURCE_RATE_LIMIT_RPS` | Sentry issue alert: tag `alert` equals `source_usage_high`; action: email | Search cache hit rate; a refresh backlog; raise the limit only with the Source's permission |
| Uptime 99.9% (PRD §11) | none (outside monitor) | Outside uptime monitor | Check `/v1/ready` and the home page every minute; alert by email + Slack after 2 failures | `/v1/ready` body names the failing dependency |

Notes:

- The monitor job runs in the worker. A dead worker raises no alert from it, so also alert on the uptime monitor and watch for the Sentry "no events" heartbeat from the `system.heartbeat` log if needed.
- `source_breaker_open` is per Redis, not per process: the mark lasts twice the breaker cooldown and is renewed by each new failure, and the gateway clears it on the next success.
- Thresholds are constants in `apps/api/src/modules/ops/monitor.ts`.
