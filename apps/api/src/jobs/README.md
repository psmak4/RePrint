# Background jobs

Jobs run in the worker process (`src/worker.ts`, built to `dist/worker.js`) on one BullMQ queue named `reprint`. Everything lives in `registry.ts`.

## Add a job

Add an entry to `jobs` in `registry.ts`:

```ts
'catalog.refresh-book': defineJob({
  payload: z.object({ bookId: idSchema }),
  handler: async ({ bookId }, { log }) => {
    // do the work; the return value is stored on the job
  },
}),
```

- **Names** are `<area>.<action>`, lowercase, for example `system.heartbeat`.
- **`payload`** is a Zod schema. It is checked when the job is enqueued and again before the handler runs, so a bad payload never reaches a handler.
- **`handler`** gets the parsed payload and a context (`{ log, mailer, db, redis, storage, catalog }`; later tasks add services there). Throwing marks the job failed. Handlers must be safe to run twice.
- **Types** come from the registry: `JobName`, `JobPayload<'name'>`, and `JobResult<'name'>`.

## Enqueue a job

```ts
const jobQueue = createJobQueue(env.REDIS_URL) // src/jobs/queue.ts
await jobQueue.enqueue('system.heartbeat', { note: 'hello' }) // name and payload are type-checked
```

## Retry a job

Add `retry: { attempts, backoffMs }` to the entry for exponential backoff between attempts (`email.send` does). Without it a failed job is not retried.

## Send an email

Enqueue `email.send` with a template name, the recipient, and that template's props; templates live in `packages/email`:

```ts
await jobQueue.enqueue('email.send', {
  template: 'verify-email',
  to: user.email,
  props: { username: user.username, verifyUrl },
})
```

## Repeat a job

Add `schedule: { everyMs, payload }` to the entry. The worker calls `syncSchedules()` at startup, which creates or updates one repeatable schedule per job name in Redis, so several worker instances never duplicate it. Removing `schedule` from an entry does not delete the stored schedule; remove it with `queue.removeJobScheduler(name)` in a task.

## Run and test

- `pnpm dev` runs the API and the worker together; `pnpm --filter api dev:worker` runs only the worker.
- `GET /v1/ready` reports the queue as `queue`.
- Integration tests use `startTestStack()` and can start the worker with `startWorker()` (see `worker.integration.test.ts`).
