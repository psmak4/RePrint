import type { NotificationListResponse } from '@reprint/shared'
import { type SyntheticEvent, useState } from 'react'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

const NONE: ReadonlySet<string> = new Set()

const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

/** The header bell: unread count on the button, the newest notifications in a dropdown (PRD §7.12). */
export function NotificationBell({
  notifications,
}: {
  notifications: NotificationListResponse | null
}) {
  const fetcher = useFetcher()
  // Which items were unread when the list opened, so they stay marked while it is open.
  const [fresh, setFresh] = useState(NONE)
  if (!notifications) return null
  const c = copy.shell.notifications
  // Marking is optimistic; the loader's count takes over once the request settles.
  const unread = fetcher.state === 'idle' ? notifications.unreadCount : 0

  function onToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open || !notifications || notifications.unreadCount === 0) return
    setFresh(new Set(notifications.items.filter((n) => !n.read).map((n) => n.id)))
    fetcher.submit(null, { method: 'post', action: '/notifications/read' })
  }

  return (
    <details className="relative" onToggle={onToggle}>
      <summary
        aria-label={unread > 0 ? c.unreadLabel(unread) : c.label}
        className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-full px-3 text-sm font-medium hover:bg-surface-raised"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current">
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"
          />
        </svg>
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="rounded-full bg-accent px-1.5 text-xs text-accent-foreground"
          >
            {unread}
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-2xl border border-border bg-surface p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.3)]">
        {notifications.items.length === 0 ? (
          <p className="p-3 text-sm">{c.empty}</p>
        ) : (
          <ul aria-label={c.label}>
            {notifications.items.map((item) => (
              <li key={item.id} className="rounded-lg p-3 text-sm">
                <p>
                  {fresh.has(item.id) ? <strong className="sr-only">{c.unreadMark} </strong> : null}
                  {c.messages[item.type]}
                </p>
                <time dateTime={item.createdAt} className="text-xs text-muted-foreground">
                  {dateFormat.format(new Date(item.createdAt))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
