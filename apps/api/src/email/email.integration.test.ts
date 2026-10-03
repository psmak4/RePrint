import { tmpdir } from 'node:os'
import { QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createJobQueue, type JobQueue, QUEUE_NAME } from '../jobs/queue.js'
import { startWorker } from '../jobs/worker-runtime.js'
import { LocalImageStorage } from '../storage/index.js'
import { startTestStack, type TestStack } from '../testing/stack.js'
import { createMailer, type Mailer } from './mailer.js'

/** Same image as docker-compose.yml (D-056). */
const MAILPIT_IMAGE = 'axllent/mailpit'

interface MailpitMessage {
  ID: string
  Subject: string
  From: { Address: string }
  To: { Address: string }[]
}

let stack: TestStack
let mailpit: StartedTestContainer
let apiUrl: string
let mailer: Mailer
let jobQueue: JobQueue
let events: QueueEvents
let eventsConnection: Redis
let stopWorker: () => Promise<void>

async function messagesFor(address: string): Promise<MailpitMessage[]> {
  const response = await fetch(
    `${apiUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  )
  const body = (await response.json()) as { messages: MailpitMessage[] }
  return body.messages
}

beforeAll(async () => {
  stack = await startTestStack()
  mailpit = await new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp('/readyz', 8025))
    .start()
  apiUrl = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`
  mailer = createMailer({
    EMAIL_TRANSPORT: 'smtp',
    EMAIL_FROM: 'RePrint <no-reply@reprint.test>',
    SMTP_HOST: mailpit.getHost(),
    SMTP_PORT: mailpit.getMappedPort(1025),
  })
  jobQueue = createJobQueue(stack.redisUrl)
  eventsConnection = new Redis(stack.redisUrl, { maxRetriesPerRequest: null })
  eventsConnection.on('error', () => {})
  events = new QueueEvents(QUEUE_NAME, { connection: eventsConnection })
  events.on('error', () => {})
  await events.waitUntilReady()
  const worker = await startWorker({
    redisUrl: stack.redisUrl,
    log: pino({ level: 'silent' }),
    mailer,
    db: stack.db.db,
    redis: stack.redis,
    storage: new LocalImageStorage(tmpdir(), 'http://localhost/uploads'),
    // The email job never touches the Source.
    catalog: undefined as never,
    sourceRps: 2,
  })
  stopWorker = worker.stop
})

afterAll(async () => {
  await stopWorker?.()
  await events?.close()
  eventsConnection?.disconnect()
  await jobQueue?.close()
  mailer?.close()
  await mailpit?.stop()
  await stack?.stop()
})

describe('email.send job', () => {
  it('delivers a rendered verify-email message to Mailpit', async () => {
    const verifyUrl = 'https://www.reprint.test/verify-email?token=integration'
    const id = await jobQueue.enqueue('email.send', {
      template: 'verify-email',
      to: 'ada@example.test',
      props: { username: 'ada_l', verifyUrl },
    })
    const job = await jobQueue.queue.getJob(id)
    await job?.waitUntilFinished(events, 30_000)

    const [message] = await messagesFor('ada@example.test')
    expect(message).toMatchObject({
      Subject: 'Verify your email address',
      From: { Address: 'no-reply@reprint.test' },
      To: [{ Address: 'ada@example.test' }],
    })
    const detail = (await (await fetch(`${apiUrl}/api/v1/message/${message?.ID}`)).json()) as {
      HTML: string
      Text: string
    }
    expect(detail.HTML).toContain(verifyUrl)
    expect(detail.Text).toContain(verifyUrl)
  })

  it('delivers a review decision with the moderator reason to Mailpit', async () => {
    const id = await jobQueue.enqueue('email.send', {
      template: 'review-decision',
      to: 'reviewer@example.test',
      props: {
        username: 'ada_l',
        bookTitle: 'Dune',
        decision: 'rejected',
        reason: 'Please remove the spoilers.',
        bookUrl: 'https://www.reprint.test/books/dune',
      },
    })
    const job = await jobQueue.queue.getJob(id)
    await job?.waitUntilFinished(events, 30_000)

    const [message] = await messagesFor('reviewer@example.test')
    expect(message?.Subject).toBe('A moderator decided on your review')
    const detail = (await (await fetch(`${apiUrl}/api/v1/message/${message?.ID}`)).json()) as {
      Text: string
    }
    expect(detail.Text).toContain('Please remove the spoilers.')
    expect(detail.Text).toContain('https://www.reprint.test/books/dune')
  })

  it('refuses an invalid payload before it is queued', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately violates the payload type
      jobQueue.enqueue('email.send', { template: 'verify-email', to: 'nope', props: {} } as any),
    ).rejects.toThrow()
    expect(await messagesFor('nope')).toHaveLength(0)
  })
})
