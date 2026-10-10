import type { ModStats } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ageText } from './review-queue.js'

const text = copy.admin.dashboard

/** Counts and oldest-item ages for each moderation queue (PRD §7.10). */
export function ModerationDashboard({ stats, now }: { stats: ModStats; now: string }) {
  return (
    <section aria-labelledby="dashboard-heading" className="flex flex-col gap-4">
      <h2
        id="dashboard-heading"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.title}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <dt className="text-sm text-muted-foreground">{text.pendingLabel}</dt>
          <dd className="mt-2 font-serif text-[40px] leading-none font-medium">
            {stats.pendingCount}
          </dd>
          <dd className="mt-1 text-sm text-muted-foreground">
            {stats.oldestPendingAt
              ? text.oldest(ageText(stats.oldestPendingAt, now))
              : text.nothingWaiting}
          </dd>
          <dd className="mt-3 text-sm">
            <Link to="/admin/reviews" className="underline">
              {text.openQueue}
            </Link>
          </dd>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <dt className="text-sm text-muted-foreground">{text.reportsLabel}</dt>
          <dd className="mt-2 font-serif text-[40px] leading-none font-medium">
            {stats.openReportCount}
          </dd>
          <dd className="mt-1 text-sm text-muted-foreground">
            {stats.oldestOpenReportAt
              ? text.oldest(ageText(stats.oldestOpenReportAt, now))
              : text.nothingReported}
          </dd>
          <dd className="mt-3 text-sm">
            <Link to="/admin/reports" className="underline">
              {text.openReports}
            </Link>
          </dd>
        </div>
      </dl>
    </section>
  )
}
