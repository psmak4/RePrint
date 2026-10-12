import type { ModQueueItem, ModStats } from '@reprint/shared'
import { Button } from '@reprint/ui'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from '../books/cover.js'
import { AdminPage } from './admin-page.js'
import { AdminCard, Badge } from './admin-ui.js'
import { AdminIcon, type AdminIconName } from './icons.js'
import { ageText } from './review-queue.js'

const text = copy.admin.dashboard
const reviewsText = copy.admin.reviews

function QueueCard({
  icon,
  iconClass,
  label,
  count,
  oldestAt,
  now,
  empty,
  link,
  primary,
}: {
  icon: AdminIconName
  iconClass: string
  label: string
  count: number
  oldestAt: string | null
  now: string
  empty: string
  link: { to: string; text: string }
  primary: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-5 rounded-[18px] border border-border bg-surface p-6">
      <dt className="flex basis-full items-center gap-3.5 text-base font-semibold">
        <span
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <AdminIcon name={icon} className="size-[22px]" />
        </span>
        {label}
      </dt>
      <dd className="text-5xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {count}
      </dd>
      <dd>
        {oldestAt ? (
          <Badge tone="amber">{text.oldest(ageText(oldestAt, now))}</Badge>
        ) : (
          <span className="inline-flex items-center gap-2 text-[15px] text-success">
            <AdminIcon name="check" />
            {empty}
          </span>
        )}
      </dd>
      <dd className="basis-full">
        <Button asChild variant={primary ? 'default' : 'outline'}>
          <Link to={link.to}>{link.text}</Link>
        </Button>
      </dd>
    </div>
  )
}

/** Counts and oldest-item ages for each moderation queue, then the oldest pending reviews (PRD §7.10). */
export function ModerationDashboard({
  stats,
  now,
  oldest,
}: {
  stats: ModStats
  now: string
  oldest: ModQueueItem[] | null
}) {
  return (
    <AdminPage eyebrow={copy.admin.title} title={copy.admin.dashboardNav} lead={text.lead}>
      <dl className="grid gap-5 md:grid-cols-2">
        <QueueCard
          icon="reviews"
          iconClass="bg-[#eff6ff] text-accent"
          label={text.pendingLabel}
          count={stats.pendingCount}
          oldestAt={stats.oldestPendingAt}
          now={now}
          empty={text.nothingWaiting}
          link={{ to: '/admin/reviews', text: text.openQueue }}
          primary={stats.pendingCount > 0}
        />
        <QueueCard
          icon="reports"
          iconClass="bg-[#fff7ed] text-[#9a3412]"
          label={text.reportsLabel}
          count={stats.openReportCount}
          oldestAt={stats.oldestOpenReportAt}
          now={now}
          empty={text.nothingReported}
          link={{ to: '/admin/reports', text: text.openReports }}
          primary={false}
        />
      </dl>
      {oldest && oldest.length > 0 ? (
        <AdminCard
          title={text.waitingHeading}
          actions={
            <Link
              to="/admin/reviews"
              className="text-[15px] font-semibold text-link hover:underline"
            >
              {text.seeAll(stats.pendingCount)}
            </Link>
          }
        >
          <ol>
            {oldest.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-[#ece8e0] py-3.5 first:border-t-0 first:pt-0 sm:grid-cols-[40px_minmax(0,1fr)_auto_auto]"
              >
                <Cover
                  cover={null}
                  title={item.book.title}
                  slug={item.book.slug}
                  size="small"
                  className="w-10"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-serif text-lg leading-tight font-medium break-words">
                    {item.book.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
                    @{item.reviewer.username}
                    <span
                      role="img"
                      aria-label={reviewsText.ratingOf(item.rating)}
                      className="text-star"
                    >
                      {'★'.repeat(item.rating)}
                      <span className="text-[#d6d3d1]">{'★'.repeat(5 - item.rating)}</span>
                    </span>
                  </span>
                </div>
                <span className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto">
                  <Badge>{reviewsText.age(ageText(item.submittedAt, now))}</Badge>
                </span>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
                >
                  <Link
                    to={`/admin/reviews?review=${item.id}`}
                    aria-label={reviewsText.open(item.book.title)}
                  >
                    {reviewsText.openShort}
                  </Link>
                </Button>
              </li>
            ))}
          </ol>
        </AdminCard>
      ) : null}
    </AdminPage>
  )
}
