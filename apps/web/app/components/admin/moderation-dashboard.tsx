import type { ModStats } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ageText } from './review-queue.js'

const text = copy.admin.dashboard

/** Counts and oldest-item ages for each moderation queue (PRD §7.10). Reports are filled in by M7. */
export function ModerationDashboard({ stats, now }: { stats: ModStats; now: string }) {
  return (
    <section aria-labelledby="dashboard-heading" className="flex flex-col gap-4">
      <h2 id="dashboard-heading" className="text-2xl font-semibold">
        {text.title}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border p-4">
          <dt className="text-sm text-muted-foreground">{text.pendingLabel}</dt>
          <dd className="mt-1 text-3xl font-semibold">{stats.pendingCount}</dd>
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
        <div className="rounded-md border border-border p-4">
          <dt className="text-sm text-muted-foreground">{text.reportsLabel}</dt>
          <dd className="mt-1 text-3xl font-semibold">{'–'}</dd>
          <dd className="mt-1 text-sm text-muted-foreground">{text.reportsUnavailable}</dd>
        </div>
      </dl>
    </section>
  )
}
