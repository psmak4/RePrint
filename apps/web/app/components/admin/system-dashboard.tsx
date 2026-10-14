import type { AdminSystem } from '@reprint/shared'
import { cn } from '@reprint/ui'
import { useEffect } from 'react'
import { useRevalidator } from 'react-router'
import { adminCopy } from '../../copy/admin.js'
import { AdminPage } from './admin-page.js'
import { AdminCard, Badge, StatTile } from './admin-ui.js'

const text = adminCopy.system

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

const BAR_WIDTHS = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const

/** A bar width class, to the nearest 5%: inline styles are not allowed (D-185). */
export function barWidth(percent: number): string {
  return BAR_WIDTHS[Math.round(Math.min(100, Math.max(0, percent)) / 5)] ?? 'w-0'
}

function Bar({ percent, label, tone }: { percent: number; label: string; tone: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="block h-2 overflow-hidden rounded-full bg-[#ece8e0]"
    >
      <span className={cn('block h-full rounded-full', tone, barWidth(percent))} />
    </span>
  )
}

const metric = 'flex flex-col gap-3 rounded-xl border border-[#ece8e0] bg-[#fdfcfa] px-4 py-3.5'

/** Source requests per second, search cache hit rate, breaker state, and queue depth (PRD §6). */
export function SystemDashboard({ system }: { system: AdminSystem }) {
  const revalidator = useRevalidator()
  const { revalidate } = revalidator
  useEffect(() => {
    const timer = setInterval(revalidate, REFRESH_MS)
    return () => clearInterval(timer)
  }, [revalidate])

  const { source, searchCache, queue } = system
  const usage = Math.round((source.requestsPerSecond / source.limitPerSecond) * 100)
  const hit = searchCache.hitRate === null ? 0 : Math.round(searchCache.hitRate * 100)
  return (
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[{ label: adminCopy.title, to: '/admin' }, { label: text.title }]}
      actions={
        <Badge dot>{text.updatedBadge(timeFormat.format(new Date(system.generatedAt)))}</Badge>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <AdminCard
          title={text.sourceHeading}
          actions={
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{text.breaker}</span>
              <Badge dot tone={source.breakerOpen ? 'red' : 'green'}>
                {source.breakerOpen ? text.breakerOpen : text.breakerClosed}
              </Badge>
            </p>
          }
        >
          <dl className={metric}>
            <dt className="text-[13px] text-muted-foreground">{text.requestsPerSecond}</dt>
            <dd className="flex flex-wrap items-baseline gap-2">
              <span className="text-[28px] leading-none font-semibold tabular-nums">
                {source.requestsPerSecond.toFixed(2)}
              </span>
              <span className="text-[15px] font-medium text-muted-foreground">
                {text.ofLimit(source.limitPerSecond)}
              </span>
            </dd>
            <dd>
              <Bar percent={usage} label={text.usage(usage)} tone="bg-accent" />
            </dd>
          </dl>
        </AdminCard>
        <AdminCard title={text.cacheHeading}>
          <dl className={metric}>
            <dt className="text-[13px] text-muted-foreground">{text.hitRate}</dt>
            <dd className="text-[28px] leading-none font-semibold tabular-nums">
              {searchCache.hitRate === null
                ? text.noLookups
                : percentFormat.format(searchCache.hitRate)}
            </dd>
            {searchCache.hitRate === null ? null : (
              <dd>
                <Bar
                  percent={hit}
                  label={percentFormat.format(searchCache.hitRate)}
                  tone="bg-success"
                />
              </dd>
            )}
            <dd className="text-[13px] text-muted-foreground">
              {text.lookups(searchCache.hits, searchCache.misses)}
            </dd>
          </dl>
        </AdminCard>
      </div>
      <AdminCard
        title={text.queueHeading}
        actions={
          <p className="text-sm text-muted-foreground">
            {text.oldestWaiting}:{' '}
            <span className="font-semibold text-foreground">{age(queue.oldestWaitingSeconds)}</span>
          </p>
        }
      >
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label={text.waiting} value={numberFormat.format(queue.waiting)} />
          <StatTile label={text.active} value={numberFormat.format(queue.active)} />
          <StatTile label={text.delayed} value={numberFormat.format(queue.delayed)} />
          <StatTile label={text.failed} value={numberFormat.format(queue.failed)} />
        </dl>
      </AdminCard>
    </AdminPage>
  )
}
