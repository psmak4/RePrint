import type { AdminSystem } from '@reprint/shared'
import { useEffect } from 'react'
import { useRevalidator } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.admin.system

/** How often the numbers are read again (PRD §6). */
export const REFRESH_MS = 30_000

const numberFormat = new Intl.NumberFormat('en-US')
const percentFormat = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

function age(seconds: number | null): string {
  if (seconds === null) return text.nothingWaiting
  return seconds < 120 ? text.seconds(seconds) : text.minutes(Math.round(seconds / 60))
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold">{value}</dd>
      {note ? <dd className="mt-1 text-sm text-muted-foreground">{note}</dd> : null}
    </div>
  )
}

/** Source requests per second, search cache hit rate, breaker state, and queue depth (PRD §6). */
export function SystemDashboard({ system }: { system: AdminSystem }) {
  const revalidator = useRevalidator()
  const { revalidate } = revalidator
  useEffect(() => {
    const timer = setInterval(revalidate, REFRESH_MS)
    return () => clearInterval(timer)
  }, [revalidate])

  const { source, searchCache, queue } = system
  return (
    <section aria-labelledby="system-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="system-heading" className="text-2xl font-semibold">
          {text.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {text.refreshNote} {text.updatedAt(timeFormat.format(new Date(system.generatedAt)))}
        </p>
      </div>
      <section aria-labelledby="source-heading" className="flex flex-col gap-3">
        <h3 id="source-heading" className="text-xl font-semibold">
          {text.sourceHeading}
        </h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Stat
            label={text.requestsPerSecond}
            value={source.requestsPerSecond.toFixed(2)}
            note={text.limit(source.limitPerSecond)}
          />
          <Stat
            label={text.breaker}
            value={source.breakerOpen ? text.breakerOpen : text.breakerClosed}
          />
        </dl>
      </section>
      <section aria-labelledby="cache-heading" className="flex flex-col gap-3">
        <h3 id="cache-heading" className="text-xl font-semibold">
          {text.cacheHeading}
        </h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Stat
            label={text.hitRate}
            value={
              searchCache.hitRate === null
                ? text.noLookups
                : percentFormat.format(searchCache.hitRate)
            }
            note={text.lookups(searchCache.hits, searchCache.misses)}
          />
        </dl>
      </section>
      <section aria-labelledby="queue-heading" className="flex flex-col gap-3">
        <h3 id="queue-heading" className="text-xl font-semibold">
          {text.queueHeading}
        </h3>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={text.waiting} value={numberFormat.format(queue.waiting)} />
          <Stat label={text.active} value={numberFormat.format(queue.active)} />
          <Stat label={text.delayed} value={numberFormat.format(queue.delayed)} />
          <Stat label={text.failed} value={numberFormat.format(queue.failed)} />
          <Stat label={text.oldestWaiting} value={age(queue.oldestWaitingSeconds)} />
        </dl>
      </section>
    </section>
  )
}
