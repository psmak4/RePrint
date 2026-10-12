# Admin Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every `/admin/*` page into the redesign style from the approved mockups: one shell (band with breadcrumb, `h1`, lead, actions; grouped sidebar with icons and counts), shared building blocks, and the same behaviour as today.

**Architecture:** The `/admin` layout route keeps the permission gate, builds grouped nav data (plus queue counts from `GET /v1/mod/stats`), and hands it to its children through the outlet context. Every admin page component renders a new `AdminPage` (band + sidebar + content), so band actions can share state with the page body. Shared pieces (badges, cards, stat tiles, table classes, empty state, icons) live in `apps/web/app/components/admin/`. Web only: no API, schema, permission, or dependency changes.

**Tech Stack:** React Router 8 (framework mode, SSR), Tailwind v4, `@reprint/ui` (shadcn `Button` with `asChild`), Vitest + Testing Library + axe-core (jsdom), Playwright + axe for e2e.

**Spec:** `docs/superpowers/specs/2026-10-12-admin-redesign-design.md` (mockups: RePrint Redesign canvas, "Admin section" row)

## Global Constraints

- Web only: no API, schema, permission, or dependency changes; no new packages (no dropdown menu component).
- User-facing strings live in `apps/web/app/copy/index.ts`; components never hold literal copy.
- Inline `style` attributes are banned by the CSP (D-185): Tailwind classes only.
- `dangerouslySetInnerHTML` is banned. TypeScript strict; no `any`, `@ts-ignore`, `.skip`.
- Numbers are set in the sans (Instrument Sans) with `tabular-nums`, never the serif.
- Every action that was an underlined text link becomes a pill (`Button asChild` around `Link`), except links inside running text and table cells.
- Page `<title>`s stay as they are.
- Node 24 is required: in this worktree run commands through the wrapper `$N24` = `/private/tmp/claude-501/-Users-preston-Projects-RePrint/f5c52d83-1202-47f1-b6e6-11b43c0323e1/scratchpad/n24` (it prepends Node 24 to `PATH`).
- `@reprint/ui` is consumed from its build: after changing it run `$N24 pnpm --filter @reprint/ui build`.
- Tests: `$N24 pnpm --filter web exec vitest run <files>`; the whole web suite is `$N24 pnpm --filter web exec vitest run`.

## Review Focus

1. A viewer with `reports.resolve` but not `reviews.moderate` opens the admin area: the layout must not call `/v1/mod/stats` (it would answer 403), and Reports queue shows without a count. (Task 2 test.)
2. `/v1/mod/stats` fails or times out: every admin page still renders, with no count badges and no error. (Task 2 test.)
3. Long unbroken values (an email, a username, a Genre slug, an audit target ID) at 390 px: they truncate or wrap inside their cell or scroll region, and the page itself never scrolls sideways. (Task 15 e2e check: `scrollWidth <= innerWidth` on every admin page at 390 px.)
4. Genres "Find a Genre" matches a child Genre whose parent does not match: the child row still shows (with its parent named in the Parent column). Archived Genres are hidden until "Show archived" is checked, and their children still show. (Task 11 test.)
5. A review claimed by another Moderator is opened: the strip is amber, says who holds it, and Approve and Reject are disabled. (Task 4 test.)

---

## File map

| File | Responsibility |
| --- | --- |
| Create `apps/web/app/components/admin/icons.tsx` | `AdminIcon` (stroke SVGs by name) |
| Create `apps/web/app/components/admin/admin-ui.tsx` | `Badge`, `USER_STATUS_TONE`, `AdminCard`, `StatTile`, `EmptyState`, `Kbd`, table class strings |
| Modify `apps/web/app/components/admin/scroll-region.tsx` | Flush card look for wide tables |
| Create `apps/web/app/components/admin/admin-page.tsx` | `AdminPage` (band + nav + content), `AdminNav`, `useAdminNav`, nav types |
| Modify `apps/web/app/components/admin/admin-layout.tsx` | Outlet with nav context, no band |
| Modify `apps/web/app/routes/admin.tsx` | Grouped nav + counts |
| Modify `packages/ui/src/components/button.tsx` | `danger` variant |
| Modify each admin page component and its test | Restyle onto `AdminPage` |
| Modify `apps/web/app/routes/admin-index.tsx` | Load the 3 oldest pending reviews |
| Modify `apps/web/app/routes/admin-catalog-genres.tsx` | `?tab=` |
| Modify `apps/web/app/copy/index.ts` | New strings |
| Modify `e2e/specs/admin.spec.ts`, `e2e/specs/a11y-pages.spec.ts` | Per-page `h1`, phone sweep |
| Modify `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, `docs/PROGRESS.md` | Docs |

---

### Task 1: Building blocks, icons, copy, and the danger button

**Files:**
- Create: `apps/web/app/components/admin/icons.tsx`
- Create: `apps/web/app/components/admin/admin-ui.tsx`
- Create: `apps/web/app/components/admin/admin-ui.test.tsx`
- Modify: `apps/web/app/components/admin/scroll-region.tsx`
- Modify: `packages/ui/src/components/button.tsx`
- Modify: `apps/web/app/copy/index.ts` (the `admin` block)

**Interfaces:**
- Produces:
  - `AdminIcon({ name: AdminIconName; className?: string })`; `AdminIconName` = `'dashboard' | 'reviews' | 'reports' | 'users' | 'audit' | 'catalog' | 'merge' | 'genres' | 'featured' | 'system' | 'check' | 'clock' | 'search' | 'plus' | 'filter' | 'chevronDown' | 'chevronRight'`
  - `Badge({ tone?: BadgeTone; dot?: boolean; children })`, `BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray'`
  - `USER_STATUS_TONE: Record<AdminUserStatus, BadgeTone>`
  - `AdminCard({ title?, titleId?, label?, actions?, flush?, className?, children })` renders a `section`
  - `StatTile({ label, value, note? })` renders `dt` then `dd` (use inside a `dl`)
  - `EmptyState({ children, action? })`
  - `Kbd({ children })`
  - `tableClass`, `thClass`, `tdClass`, `numClass` strings
  - `Button` variant `danger`
  - Copy keys listed in Step 5

- [ ] **Step 1: Write the failing test**

`apps/web/app/components/admin/admin-ui.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminCard, Badge, EmptyState, StatTile, USER_STATUS_TONE } from './admin-ui.js'
import { AdminIcon } from './icons.js'

afterEach(cleanup)

describe('admin building blocks', () => {
  it('Badge carries its tone and an optional dot', () => {
    render(
      <Badge tone="red" dot>
        Suspended
      </Badge>,
    )
    const badge = screen.getByText('Suspended')
    expect(badge.className).toContain('text-danger')
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('maps every user status to a tone', () => {
    expect(USER_STATUS_TONE).toEqual({
      active: 'green',
      unverified: 'amber',
      suspended: 'red',
      deleted: 'gray',
    })
  })

  it('AdminCard labels its section by its title', () => {
    render(<AdminCard title="Profile">body</AdminCard>)
    expect(screen.getByRole('region', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Profile' })).toBeTruthy()
  })

  it('StatTile puts the value in the dd after its label', () => {
    render(
      <dl>
        <StatTile label="Waiting" value="3" note="Oldest 2 min" />
      </dl>,
    )
    expect(screen.getByText('Waiting').tagName).toBe('DT')
    expect(screen.getByText('Waiting').nextElementSibling?.textContent).toBe('3')
    expect(screen.getByText('Oldest 2 min').tagName).toBe('DD')
  })

  it('EmptyState shows its sentence with a check', () => {
    const { container } = render(<EmptyState>Nothing waits.</EmptyState>)
    expect(screen.getByText('Nothing waits.')).toBeTruthy()
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('AdminIcon is decorative', () => {
    const { container } = render(<AdminIcon name="users" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/admin-ui.test.tsx`
Expected: FAIL with "Cannot find module './admin-ui.js'"

- [ ] **Step 3: Write the icons**

`apps/web/app/components/admin/icons.tsx`:

```tsx
import { cn } from '@reprint/ui'
import type { ReactNode } from 'react'

const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  reviews: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  reports: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  audit: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </>
  ),
  catalog: <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  merge: (
    <>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </>
  ),
  genres: (
    <>
      <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.59-8.59a1 1 0 0 0 0-1.41z" />
      <circle cx="7" cy="7" r="1.5" />
    </>
  ),
  featured: (
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
  ),
  system: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  check: <path d="M20 6 9 17l-5-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  filter: <path d="M3 6h18M7 12h10M10 18h4" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
} satisfies Record<string, ReactNode>

export type AdminIconName = keyof typeof PATHS

/** A stroke icon for the admin section. Decorative: a label always sits beside it. */
export function AdminIcon({ name, className }: { name: AdminIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-[18px] shrink-0', className)}
    >
      {PATHS[name]}
    </svg>
  )
}
```

- [ ] **Step 4: Write the building blocks**

`apps/web/app/components/admin/admin-ui.tsx`:

```tsx
import type { AdminUserStatus } from '@reprint/shared'
import { cn } from '@reprint/ui'
import { type ReactNode, useId } from 'react'
import { AdminIcon } from './icons.js'

export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray'

const TONES: Record<BadgeTone, string> = {
  green: 'border-[#a7f3d0] bg-[#ecfdf3] text-success',
  amber: 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]',
  red: 'border-[#fecaca] bg-[#fef2f2] text-danger',
  blue: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]',
  gray: 'border-border bg-surface-raised text-[#334155]',
}

/** A small pill for a status, a role, a count, or an age. */
export function Badge({
  tone = 'gray',
  dot = false,
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
      )}
    >
      {dot ? <span aria-hidden="true" className="size-[7px] rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

export const USER_STATUS_TONE: Record<AdminUserStatus, BadgeTone> = {
  active: 'green',
  unverified: 'amber',
  suspended: 'red',
  deleted: 'gray',
}

/** A white card. With `title` it is a region named by its serif `h2`. `flush` drops the padding (tables). */
export function AdminCard({
  title,
  label,
  actions,
  flush = false,
  className,
  children,
}: {
  title?: ReactNode
  /** Names the region when there is no visible title. */
  label?: string
  actions?: ReactNode
  flush?: boolean
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-[18px] border border-border bg-surface',
        flush ? 'gap-0 overflow-hidden' : 'p-5 md:p-6',
        className,
      )}
    >
      {title ? (
        <div
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-3',
            flush && 'px-5 pt-5 pb-4',
          )}
        >
          <h2 id={titleId} className="font-serif text-[22px] leading-tight font-medium">
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** One number with its label (a `dt` and `dd`s), for use inside a `dl`. Never the serif. */
export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[#ece8e0] bg-[#fdfcfa] px-4 py-3.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-[28px] leading-none font-semibold tracking-[-0.01em] tabular-nums">
        {value}
      </dd>
      {note ? <dd className="text-[13px] text-muted-foreground">{note}</dd> : null}
    </div>
  )
}

/** A dashed box with a green check and one sentence, and optionally one action. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[18px] border border-dashed border-[#d9d4ca] bg-[#fdfcfa] p-5 sm:flex-row sm:items-center">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ecfdf3] text-success">
        <AdminIcon name="check" />
      </span>
      <p className="flex-1 text-[15px] text-[#334155]">{children}</p>
      {action}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-[#d9d4ca] bg-surface px-1.5 font-sans text-xs font-semibold text-[#1e293b]">
      {children}
    </kbd>
  )
}

export const tableClass =
  'w-full border-collapse text-left text-[15px] [&_tbody_tr:last-child>*]:border-b-0'
export const thClass =
  'border-b border-border bg-[#f7f5f0] px-4 py-3 text-xs font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase'
export const tdClass = 'border-b border-[#ece8e0] px-4 py-3 align-middle'
export const numClass = 'text-right tabular-nums'
```

Replace the `className` in `apps/web/app/components/admin/scroll-region.tsx`:

```tsx
      className="overflow-x-auto rounded-[18px] border border-border bg-surface"
```

In `packages/ui/src/components/button.tsx`, add to `variant`:

```ts
        danger: 'border border-[#dc2626] bg-surface text-danger hover:bg-[#fef2f2]',
```

- [ ] **Step 5: Add the copy**

In `apps/web/app/copy/index.ts`, inside `admin:` add after `navToggle`:

```ts
    breadcrumbLabel: 'Breadcrumb',
    navGroups: {
      moderation: 'Moderation',
      people: 'People',
      catalog: 'Catalog',
      operations: 'Operations',
    },
    navCount: (n: number) => `${n} waiting`,
```

and add these keys inside the named sections (keep every existing key):

```ts
    // admin.system
      lead: 'Source requests, the search cache, and background jobs.',
      updatedBadge: (time: string) => `Updated at ${time} UTC · refreshes every 30 s`,
      ofLimit: (limit: number) => `of ${limit} per second`,
      usage: (percent: number) => `${percent}% of the limit`,
    // admin.catalog
      lead: 'Find a Book on RePrint and see how the Catalog grows.',
    // admin.merge
      lead: 'Possible duplicate Books, oldest first. Keeping one moves everything onto it.',
    // admin.featured
      lead: 'What the Discover page features.',
    // admin.genres
      lead: 'Genres are the browse categories readers see. Subject rules map the Source’s Subjects onto them.',
      tabsLabel: 'Genres and rules sections',
      findLabel: 'Find a Genre',
      showArchived: 'Show archived',
      noMatch: 'No Genres match.',
      shown: (shown: number, total: number) => `Showing ${shown} of ${total} Genres`,
      columns: {
        genre: 'Genre',
        parent: 'Parent',
        books: 'Books',
        rules: 'Rules',
        actions: 'Actions',
        pattern: 'Pattern',
        priority: 'Priority',
      },
      editShort: 'Edit',
      archiveShort: 'Archive',
      restoreShort: 'Restore',
      removeShort: 'Remove',
    // admin.audit
      lead: 'Every Moderator and Admin action, newest first.',
      filtersLabel: 'Filter the audit log',
    // admin.dashboard
      lead: 'What is waiting for a decision.',
      waitingHeading: 'Waiting longest',
      seeAll: (n: number) => `See all ${n}`,
    // admin.reviews
      lead: 'Oldest first. Opening a review claims it for you.',
      editedBadge: 'Edited',
      shortcutKeys: [
        ['A', 'approve'],
        ['R', 'reject'],
        ['J', 'next'],
        ['K', 'previous'],
      ] as const,
    // admin.reports
      lead: 'Reviews with open reports, oldest first.',
    // admin.users
      lead: 'Every account, newest first. Open one to change its roles or suspend it.',
      filtersLabel: 'Filter users',
      filtersToggle: 'Filters',
    // admin.users.detail
      joinedLine: (username: string, date: string) => `@${username} · Joined ${date}`,
```

- [ ] **Step 6: Build the UI package and run the test**

Run: `$N24 pnpm --filter @reprint/ui build && $N24 pnpm --filter web exec vitest run app/components/admin/admin-ui.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/components/admin/icons.tsx apps/web/app/components/admin/admin-ui.tsx apps/web/app/components/admin/admin-ui.test.tsx apps/web/app/components/admin/scroll-region.tsx packages/ui/src/components/button.tsx apps/web/app/copy/index.ts
git commit -m "feat(admin): shared building blocks, icons, and copy for the admin redesign (D-201)"
```

---

### Task 2: The shell (layout loader, outlet context, `AdminPage`, grouped nav)

**Files:**
- Create: `apps/web/app/components/admin/admin-page.tsx`
- Create: `apps/web/app/components/admin/admin-page.test.tsx`
- Modify: `apps/web/app/components/admin/admin-layout.tsx`
- Modify: `apps/web/app/routes/admin.tsx`
- Modify: `apps/web/app/routes/admin.test.ts`

**Interfaces:**
- Consumes: `AdminIcon`, `AdminIconName` (Task 1); `copy.admin.navGroups`, `navCount`, `breadcrumbLabel`
- Produces:
  - `type AdminNavItem = { to: string; label: string; icon: AdminIconName; count?: number }`
  - `type AdminNavGroup = { label: string; items: AdminNavItem[] }`
  - `type AdminCrumb = { label: string; to?: string }`
  - `AdminPage({ title, lead?, eyebrow?, crumbs?, leading?, actions?, below?, children })`
  - `useAdminNav(): AdminNavGroup[] | null`
  - Layout loader returns `{ groups: AdminNavGroup[] }`

- [ ] **Step 1: Write the failing loader tests**

Replace the module mock at the top of `apps/web/app/routes/admin.test.ts` so `apiClientFor` keeps working, and stub `fetch`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { metaArgs } from '../lib/seo.testing.js'
import { loader, meta } from './admin.js'

const args = { request: new Request('https://reprint.test/admin/reviews') } as never
const viewer = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})
const stats = {
  pendingCount: 3,
  oldestPendingAt: '2026-10-01T00:00:00.000Z',
  oldestPendingAgeSeconds: 7200,
  openReportCount: 1,
  oldestOpenReportAt: '2026-10-01T00:00:00.000Z',
  oldestOpenReportAgeSeconds: 7200,
}

beforeEach(() => loadSession.mockReset())
afterEach(() => vi.unstubAllGlobals())
```

Keep the redirect, 403, and noindex tests as they are. Replace every `items:` expectation with the grouped shape, for example:

```ts
  it('groups the queues for a Moderator and adds the counts', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate', 'reports.resolve']))
    const paths: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      paths.push(new URL(String(url)).pathname)
      return Response.json(stats)
    })
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'Moderation',
          items: [
            { to: '/admin', label: 'Dashboard', icon: 'dashboard' },
            { to: '/admin/reviews', label: 'Review queue', icon: 'reviews', count: 3 },
            { to: '/admin/reports', label: 'Reports queue', icon: 'reports', count: 1 },
          ],
        },
      ],
    })
    expect(paths).toEqual(['/v1/mod/stats'])
  })

  it('never asks for the counts without reviews.moderate', async () => {
    loadSession.mockResolvedValue(viewer(['reports.resolve']))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'Moderation',
          items: [{ to: '/admin/reports', label: 'Reports queue', icon: 'reports' }],
        },
      ],
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves the counts off when the stats request fails', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }))
    const { groups } = await loader(args)
    expect(groups[0]?.items.every((item) => item.count === undefined)).toBe(true)
  })

  it('leaves the counts off when the stats request throws', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED')
    })
    const { groups } = await loader(args)
    expect(groups[0]?.items.map((item) => item.count)).toEqual([undefined, undefined])
  })

  it('lists People for users.view and audit.view', async () => {
    loadSession.mockResolvedValue(viewer(['users.view', 'audit.view']))
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'People',
          items: [
            { to: '/admin/users', label: 'Users', icon: 'users' },
            { to: '/admin/audit', label: 'Audit log', icon: 'audit' },
          ],
        },
      ],
    })
  })

  it('lists Catalog and Operations for catalog.manage and featured.manage', async () => {
    loadSession.mockResolvedValue(viewer(['catalog.manage', 'featured.manage']))
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'Catalog',
          items: [
            { to: '/admin/catalog', label: 'Catalog', icon: 'catalog' },
            { to: '/admin/catalog/merge', label: 'Merge queue', icon: 'merge' },
            { to: '/admin/catalog/genres', label: 'Genres and rules', icon: 'genres' },
            { to: '/admin/featured', label: 'Featured content', icon: 'featured' },
          ],
        },
        {
          label: 'Operations',
          items: [{ to: '/admin/system', label: 'System', icon: 'system' }],
        },
      ],
    })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/routes/admin.test.ts`
Expected: FAIL: the loader still returns `{ items }`.

- [ ] **Step 3: Write the loader**

Replace the loader and component in `apps/web/app/routes/admin.tsx` (keep imports of `APP_NAME`, `PERMISSIONS`, `meta`, `ADMIN_AREA_PERMISSIONS`):

```tsx
import { APP_NAME, modStatsSchema, PERMISSIONS } from '@reprint/shared'
import { AdminLayout } from '../components/admin/admin-layout.js'
import type { AdminNavGroup, AdminNavItem } from '../components/admin/admin-page.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin'

/** The two queue counts, or null when the viewer may not moderate or the API did not answer. */
async function loadCounts(request: Request): Promise<{ reviews: number; reports: number } | null> {
  try {
    const response = await apiClientFor(request).get('/v1/mod/stats')
    if (!response.ok) return null
    const stats = modStatsSchema.safeParse(await response.json())
    return stats.success
      ? { reviews: stats.data.pendingCount, reports: stats.data.openReportCount }
      : null
  } catch (error) {
    logger.warn({ err: error }, 'could not load the admin nav counts')
    return null
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, ADMIN_AREA_PERMISSIONS)
  const can = (permission: string) => viewer.permissions.includes(permission)
  const counts = can(PERMISSIONS.reviewsModerate) ? await loadCounts(request) : null
  const item = (to: string, label: string, icon: AdminNavItem['icon'], count?: number) =>
    count === undefined ? { to, label, icon } : { to, label, icon, count }

  const moderation: AdminNavItem[] = []
  if (can(PERMISSIONS.reviewsModerate)) {
    moderation.push(item('/admin', copy.admin.dashboardNav, 'dashboard'))
    moderation.push(item('/admin/reviews', copy.admin.reviewsNav, 'reviews', counts?.reviews))
  }
  if (can(PERMISSIONS.reportsResolve)) {
    moderation.push(item('/admin/reports', copy.admin.reportsNav, 'reports', counts?.reports))
  }
  const people: AdminNavItem[] = []
  if (can(PERMISSIONS.usersView)) people.push(item('/admin/users', copy.admin.usersNav, 'users'))
  if (can(PERMISSIONS.auditView)) people.push(item('/admin/audit', copy.admin.auditNav, 'audit'))
  const catalog: AdminNavItem[] = []
  if (can(PERMISSIONS.catalogManage)) {
    catalog.push(item('/admin/catalog', copy.admin.catalogNav, 'catalog'))
    catalog.push(item('/admin/catalog/merge', copy.admin.mergeNav, 'merge'))
    catalog.push(item('/admin/catalog/genres', copy.admin.genresNav, 'genres'))
  }
  if (can(PERMISSIONS.featuredManage)) {
    catalog.push(item('/admin/featured', copy.admin.featuredNav, 'featured'))
  }
  const operations: AdminNavItem[] = []
  if (can(PERMISSIONS.catalogManage)) {
    operations.push(item('/admin/system', copy.admin.systemNav, 'system'))
  }
  const groups: AdminNavGroup[] = [
    { label: copy.admin.navGroups.moderation, items: moderation },
    { label: copy.admin.navGroups.people, items: people },
    { label: copy.admin.navGroups.catalog, items: catalog },
    { label: copy.admin.navGroups.operations, items: operations },
  ].filter((group) => group.items.length > 0)
  return { groups }
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  return <AdminLayout groups={loaderData.groups} />
}
```

- [ ] **Step 4: Run the loader tests**

Run: `$N24 pnpm --filter web exec vitest run app/routes/admin.test.ts`
Expected: FAIL only on the missing `admin-page.js` module; continue to Step 5.

- [ ] **Step 5: Write the failing `AdminPage` test**

`apps/web/app/components/admin/admin-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub, Outlet } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { type AdminNavGroup, AdminPage } from './admin-page.js'

afterEach(cleanup)

const groups: AdminNavGroup[] = [
  {
    label: 'Moderation',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'dashboard' },
      { to: '/admin/reviews', label: 'Review queue', icon: 'reviews', count: 3 },
    ],
  },
  { label: 'People', items: [{ to: '/admin/users', label: 'Users', icon: 'users' }] },
]

function renderPage(path = '/admin/users') {
  const Stub = createRoutesStub([
    {
      path: '/admin',
      Component: () => <Outlet context={groups} />,
      children: [
        {
          path: 'users',
          Component: () => (
            <AdminPage
              title="Users"
              lead="Every account."
              crumbs={[{ label: 'Administration', to: '/admin' }, { label: 'Users' }]}
              actions={<button type="button">Export</button>}
            >
              <p>Body</p>
            </AdminPage>
          ),
        },
      ],
    },
  ])
  return render(<Stub initialEntries={[path]} />)
}

describe('AdminPage', () => {
  it('puts the page title, breadcrumb, lead, and actions in the band', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeTruthy()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Administration' }).getAttribute('href')).toBe(
      '/admin',
    )
    expect(within(crumbs).getByText('Users').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Every account.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
  })

  it('groups the nav, marks the current page, and reads counts as waiting', () => {
    renderPage()
    const nav = screen.getAllByRole('navigation', { name: 'Administration sections' })[0]
    if (!nav) throw new Error('no nav')
    expect(within(nav).getAllByText('Moderation').length).toBeGreaterThan(0)
    expect(
      within(nav).getAllByRole('link', { name: 'Users' })[0]?.getAttribute('aria-current'),
    ).toBe('page')
    expect(within(nav).getAllByRole('link', { name: 'Review queue 3 waiting' }).length).toBeGreaterThan(0)
  })

  it('renders without a nav outside the admin layout (component tests)', () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <AdminPage title="Alone">x</AdminPage> },
    ])
    render(<Stub initialEntries={['/']} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Alone' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Administration sections' })).toBeNull()
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderPage()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/admin-page.test.tsx`
Expected: FAIL with "Cannot find module './admin-page.js'"

- [ ] **Step 7: Write `AdminPage`, the nav, and the layout**

`apps/web/app/components/admin/admin-page.tsx`:

```tsx
import { cn } from '@reprint/ui'
import type { ReactNode } from 'react'
import { Link, NavLink, useOutletContext } from 'react-router'
import { copy } from '../../copy/index.js'
import { AdminIcon, type AdminIconName } from './icons.js'

export type AdminNavItem = { to: string; label: string; icon: AdminIconName; count?: number }
export type AdminNavGroup = { label: string; items: AdminNavItem[] }
export type AdminCrumb = { label: string; to?: string }

/** The grouped nav the `/admin` layout passes down; null outside it (component tests). */
export function useAdminNav(): AdminNavGroup[] | null {
  return useOutletContext<AdminNavGroup[] | undefined>() ?? null
}

function NavLinks({ groups }: { groups: AdminNavGroup[] }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
                  className="group flex h-10 items-center gap-3 rounded-[10px] border border-transparent px-3 text-[15px] font-medium text-[#1e293b] hover:bg-surface-raised aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                >
                  <AdminIcon
                    name={item.icon}
                    className="text-[#64748b] group-aria-[current=page]:text-accent"
                  />
                  {item.label}
                  {item.count ? (
                    <span className="ml-auto inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">
                      <span aria-hidden="true">{item.count}</span>
                      <span className="sr-only">{copy.admin.navCount(item.count)}</span>
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** The left nav from `lg`; a disclosure above the page below it. */
function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  return (
    <nav aria-label={copy.admin.navLabel} className="lg:w-60 lg:shrink-0">
      <details className="rounded-xl border border-border bg-surface lg:hidden">
        <summary className="flex h-12 cursor-pointer items-center justify-between gap-2 px-4 text-[15px] font-semibold">
          {copy.admin.navToggle}
          <AdminIcon name="chevronDown" />
        </summary>
        <div className="p-2 pt-0">
          <NavLinks groups={groups} />
        </div>
      </details>
      <div className="hidden lg:block">
        <NavLinks groups={groups} />
      </div>
    </nav>
  )
}

function Crumbs({ crumbs }: { crumbs: AdminCrumb[] }) {
  return (
    <nav aria-label={copy.admin.breadcrumbLabel}>
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {crumb.to ? (
              <Link to={crumb.to} className="hover:text-foreground hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="break-all">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * One admin page: the warm band (breadcrumb or eyebrow, `h1`, lead, actions, and `below` for tabs),
 * then the grouped nav beside the content from `lg` (DESIGN.md, D-201).
 */
export function AdminPage({
  title,
  lead,
  eyebrow,
  crumbs,
  leading,
  actions,
  below,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  eyebrow?: string
  crumbs?: AdminCrumb[]
  /** Beside the title: an avatar or a cover. */
  leading?: ReactNode
  actions?: ReactNode
  /** Under the title row, inside the band: tabs. */
  below?: ReactNode
  children: ReactNode
}) {
  const nav = useAdminNav()
  return (
    <div className="flex flex-col gap-8">
      <div
        className={cn(
          '-mt-8 flex flex-col gap-5 border-b border-border bg-ground-deep pt-7 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)] md:pt-9',
          below ? 'pb-0' : 'pb-8 md:pb-9',
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-col gap-2.5">
            {crumbs ? <Crumbs crumbs={crumbs} /> : null}
            {eyebrow ? (
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex items-center gap-4 md:gap-5">
              {leading}
              <div className="flex min-w-0 flex-col gap-2">
                <h1 className="font-serif text-[34px] leading-[1.05] font-medium tracking-[-0.02em] break-words md:text-[44px]">
                  {title}
                </h1>
                {lead ? (
                  <div className="max-w-[640px] text-base leading-[1.5] text-muted-foreground">
                    {lead}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
        </div>
        {below}
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        {nav ? <AdminNav groups={nav} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  )
}
```

Replace `apps/web/app/components/admin/admin-layout.tsx`:

```tsx
import { Outlet } from 'react-router'
import type { AdminNavGroup } from './admin-page.js'

/** `/admin/*`: hands the grouped nav to each page, which renders its own `AdminPage` (D-201). */
export function AdminLayout({ groups }: { groups: AdminNavGroup[] }) {
  return <Outlet context={groups} />
}
```

- [ ] **Step 8: Run both tests**

Run: `$N24 pnpm --filter web exec vitest run app/routes/admin.test.ts app/components/admin/admin-page.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/components/admin/admin-page.tsx apps/web/app/components/admin/admin-page.test.tsx apps/web/app/components/admin/admin-layout.tsx apps/web/app/routes/admin.tsx apps/web/app/routes/admin.test.ts
git commit -m "feat(admin): band with breadcrumb and title, grouped nav with queue counts (D-201)"
```

Note: until every page uses `AdminPage` (Tasks 3 to 14), pages render without the sidebar. Run the whole web suite at the end of each task anyway; a page that has not moved yet still renders its own `h2`.

---

### Task 3: Dashboard

**Files:**
- Modify: `apps/web/app/routes/admin-index.tsx`, `apps/web/app/routes/admin-index.test.ts`
- Modify: `apps/web/app/components/admin/moderation-dashboard.tsx`, `moderation-dashboard.test.tsx`

**Interfaces:**
- Consumes: `AdminPage`, `AdminCard`, `Badge`, `AdminIcon`, `ageText` (`./review-queue.js`), `Cover` (`../books/cover.js`)
- Produces: `ModerationDashboard({ stats, now, oldest }: { stats: ModStats; now: string; oldest: ModQueueItem[] | null })`; loader returns `{ stats, now, oldest }`

- [ ] **Step 1: Write the failing loader test**

Add to `apps/web/app/routes/admin-index.test.ts` (inside `describe`):

```ts
  it('loads the three oldest pending reviews beside the stats', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    const requests: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      const target = new URL(String(url))
      requests.push(`${target.pathname}${target.search}`)
      return target.pathname === '/v1/mod/stats'
        ? Response.json(stats)
        : Response.json({ items: [], meta: { nextCursor: null } })
    })
    const result = await loader(args)
    expect(requests.sort()).toEqual(['/v1/mod/reviews?limit=3', '/v1/mod/stats'])
    expect(result.oldest).toEqual([])
  })

  it('still renders the stats when the queue request fails', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async (url: URL) =>
      new URL(String(url)).pathname === '/v1/mod/stats'
        ? Response.json(stats)
        : new Response('down', { status: 503 }),
    )
    const result = await loader(args)
    expect(result.stats.pendingCount).toBe(3)
    expect(result.oldest).toBeNull()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `$N24 pnpm --filter web exec vitest run app/routes/admin-index.test.ts`
Expected: FAIL: `result.oldest` is undefined.

- [ ] **Step 3: Load the queue head**

In `apps/web/app/routes/admin-index.tsx`, add (with `modQueueResponseSchema` and `ModQueueItem` imported from `@reprint/shared`):

```ts
/** The three oldest pending reviews for "Waiting longest"; null when the API did not answer. */
async function loadOldest(request: Request): Promise<ModQueueItem[] | null> {
  try {
    const response = await apiClientFor(request).get('/v1/mod/reviews?limit=3')
    if (!response.ok) return null
    const queue = modQueueResponseSchema.safeParse(await response.json())
    return queue.success ? queue.data.items : null
  } catch (error) {
    logger.warn({ err: error }, 'could not load the oldest pending reviews')
    return null
  }
}
```

Start it before the stats request and return it: `const oldestPromise = loadOldest(request)` at the top of the loader, then `return { stats, now: new Date().toISOString(), oldest: await oldestPromise }`. Pass `oldest={loaderData.oldest}` to `ModerationDashboard`.

- [ ] **Step 4: Write the failing component tests**

Replace the body of `moderation-dashboard.test.tsx`'s `renderDashboard` to pass `oldest` (default `null`), and replace the tests with:

```tsx
const item = (id: string, title: string, submittedAt: string) =>
  ({
    id,
    book: { slug: `${id}-slug`, title },
    reviewer: { username: 'quietreader', displayName: 'Q', approvedCount: 0, rejectedCount: 0, reportedCount: 0 },
    rating: 4,
    headline: null,
    body: 'x',
    hasSpoilers: false,
    editionId: null,
    version: 1,
    submittedAt,
    lastApproved: null,
  }) as never

describe('ModerationDashboard', () => {
  it('puts Dashboard in the band under the Administration eyebrow', () => {
    renderDashboard({ pendingCount: 0, oldestPendingAt: null, oldestPendingAgeSeconds: null })
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText('Administration')).toBeTruthy()
  })

  it('shows the pending count, the oldest age as a badge, and a pill to the queue', () => {
    renderDashboard({
      pendingCount: 4,
      oldestPendingAt: '2026-10-01T00:30:00.000Z',
      oldestPendingAgeSeconds: 10800,
    })
    expect(screen.getByText('Pending reviews').nextElementSibling?.textContent).toBe('4')
    expect(screen.getByText('Oldest has waited 3 hours')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the review queue' }).getAttribute('href')).toBe(
      '/admin/reviews',
    )
  })

  it('says so when nothing is waiting and leaves the list out', () => {
    renderDashboard({ pendingCount: 0, oldestPendingAt: null, oldestPendingAgeSeconds: null }, {}, [])
    expect(screen.getByText('No reviews are waiting.')).toBeTruthy()
    expect(screen.getByText('No reports are open.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Waiting longest' })).toBeNull()
  })

  it('lists the oldest pending reviews with an Open pill each', () => {
    renderDashboard(
      { pendingCount: 5, oldestPendingAt: '2026-10-01T01:30:00.000Z', oldestPendingAgeSeconds: 7200 },
      {},
      [item('a', 'Kindred', '2026-10-01T01:30:00.000Z'), item('b', 'Piranesi', '2026-10-01T03:20:00.000Z')],
    )
    const list = screen.getByRole('region', { name: 'Waiting longest' })
    expect(within(list).getByText('Kindred')).toBeTruthy()
    expect(within(list).getByText('Waiting 2 hours')).toBeTruthy()
    expect(
      within(list).getByRole('link', { name: 'Open the review of Kindred' }).getAttribute('href'),
    ).toBe('/admin/reviews?review=a')
    expect(within(list).getByRole('link', { name: 'See all 5' }).getAttribute('href')).toBe(
      '/admin/reviews',
    )
  })

  // keep the existing open-report test and the axe test
})
```

`renderDashboard(pending, reports = {}, oldest: never[] | null = null)` passes `oldest` through. Import `within` from Testing Library.

- [ ] **Step 5: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/moderation-dashboard.test.tsx`
Expected: FAIL: no `h1` "Dashboard".

- [ ] **Step 6: Rewrite the component**

`apps/web/app/components/admin/moderation-dashboard.tsx`:

```tsx
import type { ModQueueItem, ModStats } from '@reprint/shared'
import { Button } from '@reprint/ui'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from '../books/cover.js'
import { AdminCard, Badge } from './admin-ui.js'
import { AdminPage } from './admin-page.js'
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
    <div className="flex flex-col gap-5 rounded-[18px] border border-border bg-surface p-6">
      <div className="flex items-center gap-3.5">
        <span className={`inline-flex size-11 items-center justify-center rounded-xl ${iconClass}`}>
          <AdminIcon name={icon} className="size-[22px]" />
        </span>
        <dt className="text-base font-semibold">{label}</dt>
        <dd className="sr-only">{count}</dd>
      </div>
      <dd className="flex flex-wrap items-baseline gap-3.5">
        <span aria-hidden="true" className="text-5xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {count}
        </span>
        {oldestAt ? (
          <Badge tone="amber">{text.oldest(ageText(oldestAt, now))}</Badge>
        ) : (
          <span className="inline-flex items-center gap-2 text-[15px] text-success">
            <AdminIcon name="check" />
            {empty}
          </span>
        )}
      </dd>
      <dd>
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
            <Link to="/admin/reviews" className="text-[15px] font-semibold text-link hover:underline">
              {text.seeAll(stats.pendingCount)}
            </Link>
          }
        >
          <ol>
            {oldest.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-[#ece8e0] py-3.5 first:border-t-0 sm:grid-cols-[40px_minmax(0,1fr)_auto_auto]"
              >
                <Cover cover={null} title={item.book.title} slug={item.book.slug} size="small" className="w-10" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-serif text-lg leading-tight font-medium break-words">
                    {item.book.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
                    @{item.reviewer.username}
                    <span role="img" aria-label={reviewsText.ratingOf(item.rating)} className="text-star">
                      {'★'.repeat(item.rating)}
                      <span className="text-[#d6d3d1]">{'★'.repeat(5 - item.rating)}</span>
                    </span>
                  </span>
                </div>
                <span className="col-start-2 sm:col-start-auto">
                  <Badge tone="gray">{reviewsText.age(ageText(item.submittedAt, now))}</Badge>
                </span>
                <Button asChild variant="outline" size="sm" className="row-start-1 col-start-3 sm:row-start-auto sm:col-start-auto">
                  <Link to={`/admin/reviews?review=${item.id}`} aria-label={reviewsText.open(item.book.title)}>
                    {copy.admin.reviews.openShort}
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
```

Add `openShort: 'Open',` to `copy.admin.reviews`. If `text-star` is not a Tailwind colour token here, use `text-warning` (both are `#a8500a`).

- [ ] **Step 7: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/moderation-dashboard.test.tsx app/routes/admin-index.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/routes/admin-index.tsx apps/web/app/routes/admin-index.test.ts apps/web/app/components/admin/moderation-dashboard.tsx apps/web/app/components/admin/moderation-dashboard.test.tsx apps/web/app/copy/index.ts
git commit -m "feat(admin): dashboard in the redesign style with the oldest pending reviews (D-201)"
```

---

### Task 4: Review queue

**Files:**
- Modify: `apps/web/app/components/admin/review-queue.tsx`, `review-decision.tsx`, `review-queue.test.tsx`

**Interfaces:**
- Consumes: `AdminPage`, `AdminCard`, `Badge`, `Kbd`, `AdminIcon`, `InitialsAvatar` (`../books/avatar.js`), `Cover`, `Button` `danger` variant
- Produces: unchanged exports (`ReviewQueue`, `ageText`, `DecisionPanel`, `VersionComparison`, `isTypingTarget`)

- [ ] **Step 1: Write the failing tests**

Add to `review-queue.test.tsx` (reuse its existing fixtures and render helper; the helper names below are those in the file: adapt to its `renderQueue`/fixture names when they differ):

```tsx
  it('puts the title and breadcrumb in the band', () => {
    renderQueue()
    expect(screen.getByRole('heading', { level: 1, name: 'Review queue' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
  })

  it('shows the reviewer history as badges and the age as a badge', () => {
    renderQueue({ selected: firstItem, claim: { state: 'mine', expiresAt: '2026-10-01T04:00:00.000Z' } })
    const detail = screen.getByRole('article', { name: 'Selected review' })
    expect(within(detail).getByText(/approved$/)).toBeTruthy()
    expect(within(detail).getByText(/rejected$/)).toBeTruthy()
  })

  it('marks a review held by another Moderator in amber and turns the decision off', () => {
    renderQueue({ selected: firstItem, claim: { state: 'other', name: 'Tomasz' } })
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('Tomasz is handling this review.')
    expect(status.className).toContain('bg-[#fff7ed]')
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the keyboard shortcuts as keys', () => {
    renderQueue({ selected: firstItem, claim: { state: 'mine', expiresAt: '2026-10-01T04:00:00.000Z' } })
    expect(document.querySelectorAll('kbd').length).toBe(4)
  })

  it('offers Show more as a pill when there is a next page', () => {
    renderQueue({ queue: { ...queue, meta: { nextCursor: 'c2' } } })
    expect(screen.getByRole('link', { name: 'Show more' }).className).toContain('rounded-full')
  })
```

If `DecisionPanel`'s buttons are already disabled when `enabled` is false, the third test only fails on the amber class; that is expected.

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/review-queue.test.tsx`
Expected: FAIL on the `h1`, badges, amber strip, `kbd`, and pill.

- [ ] **Step 3: Restyle the list, the detail, and the claim strip**

In `review-queue.tsx`:

1. Replace `Stars` so it uses the star token: `className="text-star"` and the empty part `text-[#d6d3d1]`.
2. Replace `QueueList`'s markup:

```tsx
  if (queue.items.length === 0) return <EmptyState>{text.empty}</EmptyState>
  return (
    <AdminCard label={text.listLabel} className="gap-1 p-3 md:p-3">
      <ul aria-label={text.listLabel} className="flex flex-col gap-1">
        {queue.items.map((item) => {
          const minutes = (Date.parse(now) - Date.parse(item.submittedAt)) / 60_000
          return (
            <li key={item.id}>
              <Link
                to={queueHref(item.id, cursor)}
                aria-label={text.open(item.book.title)}
                aria-current={item.id === selectedId ? 'true' : undefined}
                className="grid grid-cols-[40px_minmax(0,1fr)] gap-3.5 rounded-xl p-3.5 hover:bg-surface-raised aria-[current=true]:bg-accent/5 aria-[current=true]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]"
              >
                <Cover cover={null} title={item.book.title} slug={item.book.slug} size="small" className="w-10" />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-serif text-[17px] leading-tight font-medium break-words">
                    {item.book.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    @{item.reviewer.username}
                    <Stars rating={item.rating} />
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={minutes >= 60 ? 'amber' : 'gray'}>
                      {text.age(ageText(item.submittedAt, now))}
                    </Badge>
                    {item.version > 1 ? <Badge>{text.editedBadge}</Badge> : null}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {queue.meta.nextCursor ? (
        <div className="flex justify-center p-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/reviews?cursor=${encodeURIComponent(queue.meta.nextCursor)}`}>
              {text.next}
            </Link>
          </Button>
        </div>
      ) : null}
    </AdminCard>
  )
```

3. Replace `ClaimNotice`'s `<p>`:

```tsx
  const mine = claim.state === 'mine'
  return (
    <p
      role="status"
      className={cn(
        'flex items-center gap-2.5 border-b px-6 py-3 text-sm font-medium',
        mine
          ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]'
          : 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]',
      )}
    >
      <AdminIcon name="clock" className="size-4" />
      {message}
    </p>
  )
```

4. Replace `ReviewDetail`'s returned markup:

```tsx
    <article
      aria-label={text.detailLabel}
      className="flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-border bg-surface"
    >
      {claim ? <ClaimNotice claim={claim} /> : null}
      <div className="flex flex-col gap-6 p-5 md:p-6">
        <header className="flex items-center gap-4">
          <Cover cover={null} title={item.book.title} slug={item.book.slug} size="small" className="w-14" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {text.bookLabel}
            </p>
            <h2 className="font-serif text-[26px] leading-tight font-medium break-words">
              <Link to={`/books/${item.book.slug}`} className="hover:underline">
                {item.book.title}
              </Link>
            </h2>
            {item.version > 1 ? (
              <p className="text-sm text-muted-foreground">{text.editedNote(item.version)}</p>
            ) : null}
          </div>
        </header>
        <div className="flex items-center gap-3.5 rounded-xl bg-[#f7f5f0] px-4 py-3.5">
          <InitialsAvatar name={reviewer.displayName} colorKey={reviewer.username} size="md" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-[15px] font-semibold break-words">
              {reviewer.displayName}{' '}
              <span className="font-normal text-muted-foreground">@{reviewer.username}</span>
            </p>
            <p className="sr-only">{text.historyHeading}</p>
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="green">{text.approved(reviewer.approvedCount)}</Badge>
              <Badge tone="red">{text.rejected(reviewer.rejectedCount)}</Badge>
              <Badge>{text.reported(reviewer.reportedCount)}</Badge>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xl">
            <Stars rating={item.rating} />
          </span>
          <Badge>{item.hasSpoilers ? text.spoilerFlag : text.noSpoilerFlag}</Badge>
          {item.editionId ? <Badge>{text.editionNote}</Badge> : null}
        </div>
        <section aria-labelledby="review-text-heading" className="flex flex-col gap-3">
          <h3 id="review-text-heading" className="sr-only">
            {text.bodyHeading}
          </h3>
          <p className="font-serif text-[26px] leading-tight font-medium">
            {item.headline ?? text.untitled}
          </p>
          <div className="font-serif text-lg leading-[1.65] text-[#1e293b]">
            <ReviewBody body={item.body} />
          </div>
        </section>
        <VersionComparison item={item} />
      </div>
      <DecisionPanel reviewId={item.id} enabled={claim?.state === 'mine'} nextHref={nextHref} />
    </article>
```

5. Replace `ReviewQueue`'s return:

```tsx
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[{ label: copy.admin.title, to: '/admin' }, { label: text.title }]}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <QueueList queue={queue} selectedId={selected?.id ?? null} cursor={cursor} now={now} />
        <div className="min-w-0">
          {selected ? (
            <ReviewDetail item={selected} claim={claim} nextHref={nextHref} />
          ) : queue.items.length > 0 ? (
            <p className="rounded-[18px] border border-dashed border-[#d9d4ca] p-6 text-muted-foreground">
              {requested ? text.notInQueue : text.selectPrompt}
            </p>
          ) : null}
        </div>
      </div>
    </AdminPage>
```

Imports to add: `Button, cn` from `@reprint/ui`; `Cover` from `../books/cover.js`; `InitialsAvatar` from `../books/avatar.js`; `AdminCard, Badge, EmptyState` from `./admin-ui.js`; `AdminPage` from `./admin-page.js`; `AdminIcon` from `./icons.js`. If `requested` is true and the queue is empty, show `text.notInQueue` above the `EmptyState` (keep that existing behaviour: render the `<p>` when `requested && !selected` even with an empty list).

- [ ] **Step 4: Restyle the decision bar**

In `review-decision.tsx`, replace `DecisionPanel`'s returned markup (keep all hooks and handlers):

```tsx
    <section
      aria-label={text.actionsLabel}
      className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-surface px-5 py-4 md:px-6"
    >
      {rejecting ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-[#fdfcfa] p-4">
          {/* the existing phrase Select, reason Textarea, hint, and Reject review / Cancel buttons, unchanged */}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          {text.shortcutKeys.map(([key, label]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <Kbd>{key}</Kbd>
              {label}
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {rejecting ? null : (
            <Button type="button" variant="danger" disabled={busy || !enabled} onClick={() => setRejecting(true)}>
              {text.reject}
            </Button>
          )}
          <Button type="button" disabled={busy || !enabled} onClick={() => decide('approve')}>
            <AdminIcon name="check" />
            {busy && submitting === 'approve' ? text.approving : text.approve}
          </Button>
        </div>
      </div>
      {decided ? (
        <p role="status" className="text-sm">
          {text.decided(decided)}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      ) : null}
    </section>
```

Move the existing rejecting block's inner markup (phrase select, textarea, hint, and the two buttons) into the commented spot verbatim. Use the existing `enabled` prop: if the current code computes a different name for "may decide" (for example `readOnly`), use that and keep the existing read-only message. Remove the old `<p>{text.shortcuts}</p>`; keep `text.shortcuts` in copy (screen readers get the keys and labels from the new line). Imports: `Kbd` from `./admin-ui.js`, `AdminIcon` from `./icons.js`.

- [ ] **Step 5: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/review-queue.test.tsx`
Expected: PASS. Fix older assertions that looked for the `h2` page title or the plain shortcuts sentence by switching them to the `h1` and the `kbd` keys; do not drop any behaviour assertion.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/admin/review-queue.tsx apps/web/app/components/admin/review-decision.tsx apps/web/app/components/admin/review-queue.test.tsx
git commit -m "feat(admin): review queue in the redesign style (D-201)"
```

---

### Task 5: Reports queue

**Files:**
- Modify: `apps/web/app/components/admin/reports-queue.tsx`, `reports-queue.test.tsx`

**Interfaces:**
- Consumes: `AdminPage`, `Badge`, `EmptyState`, `Cover`, `Button` `danger`

- [ ] **Step 1: Write the failing tests**

Add to `reports-queue.test.tsx` (adapt the fixture/helper names to the file's):

```tsx
  it('puts the title in the band and each reported review in its own card', () => {
    renderReports()
    expect(screen.getByRole('heading', { level: 1, name: 'Reports queue' })).toBeTruthy()
    const card = screen.getAllByRole('article')[0]
    if (!card) throw new Error('no card')
    expect(card.className).toContain('rounded-[18px]')
    expect(within(card).getByRole('heading', { level: 2 })).toBeTruthy()
  })

  it('shows Unpublish and Suspend author as red outline pills', () => {
    renderReports({ canUnpublish: true, canSuspend: true })
    expect(screen.getAllByRole('button', { name: 'Unpublish' })[0]?.className).toContain('text-danger')
    expect(screen.getAllByRole('button', { name: 'Suspend author' })[0]?.className).toContain('text-danger')
  })

  it('shows an empty state when no reports are open', () => {
    renderReports({ queue: { items: [], meta: { nextCursor: null } } })
    expect(screen.getByText('No reports are open.')).toBeTruthy()
  })
```

(Use the real `text.unpublish`, `text.suspendAuthor`, and `text.empty` strings from `copy.admin.reports` if they differ.)

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/reports-queue.test.tsx`
Expected: FAIL on the `h1` and classes.

- [ ] **Step 3: Restyle**

In `reports-queue.tsx`:

1. `ReportActions`: Unpublish and Suspend author buttons get `variant="danger"`; Dismiss stays default.
2. `ReportedReview`'s `<article>`: `className="flex flex-col gap-5 rounded-[18px] border border-border bg-surface p-5 md:p-6"`. Header:

```tsx
        <header className="flex items-start gap-4">
          <Cover cover={null} title={review.book.title} slug={review.book.slug} size="small" className="w-12" />
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id={headingId} className="font-serif text-[22px] leading-tight font-medium break-words">
              <Link to={`/books/${review.book.slug}`} className="hover:underline">
                {review.book.title}
              </Link>
            </h2>
            <p className="text-sm text-muted-foreground">
              <Link to={`/u/${review.author.username}`} className="hover:underline">
                {text.reviewBy(review.author.displayName)}
              </Link>
            </p>
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="amber">{text.reportCount(item.openCount)}</Badge>
              <Badge>{text.oldest(ageText(item.oldestReportedAt, now))}</Badge>
              {review.hidden ? <Badge tone="red">{text.hidden}</Badge> : null}
            </span>
          </div>
        </header>
```

   The rating line: stars `text-star` with `text-[#d6d3d1]` empties, headline `font-serif text-xl font-medium`, spoiler as `<Badge>`. Wrap `<ReviewBody>` in `<div className="font-serif text-[17px] leading-[1.6] text-[#1e293b]">`. Each report `<li>`: `rounded-xl border border-[#ece8e0] bg-[#fdfcfa] p-3.5`, with the reason as `<Badge tone="gray">` on its own line, then the note and the reporter line. The reports heading `h4` becomes `h3`.
3. `ReportsQueue`: wrap in `AdminPage` with `title={text.title}`, `lead={text.lead}`, `crumbs={[{ label: copy.admin.title, to: '/admin' }, { label: text.title }]}`; drop the `h2`; the empty case renders `<EmptyState>{text.empty}</EmptyState>`; "Show more" becomes:

```tsx
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link to={`/admin/reports?${new URLSearchParams({ cursor: queue.meta.nextCursor })}`}>
              {text.next}
            </Link>
          </Button>
        </div>
```

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/reports-queue.test.tsx`
Expected: PASS (adjust old `h3`/`h2` lookups to the new levels; keep every action assertion).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/reports-queue.tsx apps/web/app/components/admin/reports-queue.test.tsx
git commit -m "feat(admin): reports queue cards in the redesign style (D-201)"
```

---

### Task 6: Users list (table and phone list)

**Files:**
- Modify: `apps/web/app/components/admin/users-list.tsx`, `users-list.test.tsx`

**Interfaces:**
- Consumes: `AdminPage`, `AdminCard`, `Badge`, `USER_STATUS_TONE`, table classes, `ScrollRegion`, `InitialsAvatar`, `AdminIcon`

- [ ] **Step 1: Write the failing tests**

Add to `users-list.test.tsx`:

```tsx
  it('puts the title in the band and the filters in a card', () => {
    renderList()
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Filter users' })).toBeTruthy()
  })

  it('shows status and roles as badges, Member as plain text, and keeps emails on one line', () => {
    renderList()
    const table = screen.getByRole('table', { name: 'Users' })
    expect(within(table).getAllByText('Active')[0]?.closest('span')?.className).toContain('rounded-full')
    const email = within(table).getByText('mara@example.com')
    expect(email.className).toContain('truncate')
    expect(email.getAttribute('title')).toBe('mara@example.com')
  })

  it('lists the accounts as tappable rows for phones', () => {
    renderList()
    const list = screen.getByRole('list', { name: 'Users' })
    expect(within(list).getAllByRole('link').length).toBe(2)
  })

  it('offers Show more as a pill', () => {
    renderList({ users: { ...users, meta: { nextCursor: 'c2' } } })
    expect(screen.getByRole('link', { name: 'Show more' }).className).toContain('rounded-full')
  })
```

(Adapt `renderList`, `users`, and the fixture email/status to the file's fixtures. The fixture should have two users; set one's email to `mara@example.com`.)

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/users-list.test.tsx`
Expected: FAIL

- [ ] **Step 3: Rewrite the markup**

Keep the props, `active`, `nextParams`, and `dateFormat`. Add `const [filtersOpen, setFiltersOpen] = useState(active)` and replace the return:

```tsx
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[{ label: copy.admin.title, to: '/admin' }, { label: text.title }]}
    >
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between md:hidden"
        aria-expanded={filtersOpen}
        aria-controls="users-filters"
        onClick={() => setFiltersOpen(!filtersOpen)}
      >
        <span className="inline-flex items-center gap-2.5">
          <AdminIcon name="filter" />
          {text.filtersToggle}
        </span>
        <AdminIcon name="chevronDown" />
      </Button>
      <Form
        id="users-filters"
        method="get"
        aria-label={text.filtersLabel}
        className={cn(
          'flex-col gap-4 rounded-[18px] border border-border bg-surface p-5 md:flex',
          filtersOpen ? 'flex' : 'hidden',
        )}
      >
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.2fr)_repeat(2,minmax(0,1fr))_repeat(2,minmax(0,1.2fr))]">
          {/* the existing five fields, each wrapped in <div className="flex min-w-0 flex-col gap-1.5"> */}
        </div>
        <div className="flex justify-end gap-2.5">
          {active ? (
            <Button asChild variant="ghost">
              <Link to="/admin/users">{text.clear}</Link>
            </Button>
          ) : null}
          <Button type="submit">{text.filter}</Button>
        </div>
      </Form>
      {users.items.length === 0 ? (
        <EmptyState>{text.empty}</EmptyState>
      ) : (
        <>
          <div className="hidden md:block">
            <ScrollRegion label={text.listLabel}>
              <table aria-label={text.listLabel} className={tableClass}>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>{text.columns.user}</th>
                    {canSearchEmail ? <th scope="col" className={thClass}>{text.columns.email}</th> : null}
                    <th scope="col" className={thClass}>{text.columns.status}</th>
                    <th scope="col" className={thClass}>{text.columns.roles}</th>
                    <th scope="col" className={thClass}>{text.columns.joined}</th>
                    <th scope="col" className={cn(thClass, 'text-right')}>{text.columns.reviews}</th>
                    <th scope="col" className={cn(thClass, 'text-right')}>{text.columns.reports}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((user) => (
                    <tr key={user.id} className="hover:bg-[#fdfcfa]">
                      <th scope="row" className={cn(tdClass, 'font-normal')}>
                        <span className="flex items-center gap-3">
                          <InitialsAvatar name={user.displayName} colorKey={user.username} size="sm" />
                          <span className="flex min-w-0 flex-col">
                            <Link to={`/admin/users/${user.id}`} className="font-semibold whitespace-nowrap hover:underline">
                              {user.displayName}
                            </Link>
                            <span className="text-[13px] whitespace-nowrap text-muted-foreground">@{user.username}</span>
                          </span>
                        </span>
                      </th>
                      {canSearchEmail ? (
                        <td className={tdClass}>
                          <span
                            title={user.email ?? undefined}
                            className="block max-w-[220px] truncate text-muted-foreground"
                          >
                            {user.email ?? text.noEmail}
                          </span>
                        </td>
                      ) : null}
                      <td className={tdClass}>
                        <Badge tone={USER_STATUS_TONE[user.status]} dot>
                          {text.statuses[user.status]}
                        </Badge>
                      </td>
                      <td className={tdClass}>
                        <RoleBadges roles={user.roles} />
                      </td>
                      <td className={cn(tdClass, 'whitespace-nowrap text-muted-foreground')}>
                        <time dateTime={user.joinedAt}>{dateFormat.format(new Date(user.joinedAt))}</time>
                      </td>
                      <td className={cn(tdClass, numClass)}>{user.reviewCount}</td>
                      <td className={cn(tdClass, numClass)}>{user.reportsReceived}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
          <ul aria-label={text.listLabel} className="overflow-hidden rounded-[18px] border border-border bg-surface md:hidden">
            {users.items.map((user) => (
              <li key={user.id} className="border-t border-[#ece8e0] first:border-t-0">
                <Link to={`/admin/users/${user.id}`} className="grid grid-cols-[40px_minmax(0,1fr)_20px] items-center gap-3 px-4 py-3.5">
                  <InitialsAvatar name={user.displayName} colorKey={user.username} size="md" />
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-semibold break-words">
                      {user.displayName} <span className="font-normal text-muted-foreground">@{user.username}</span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={USER_STATUS_TONE[user.status]} dot>{text.statuses[user.status]}</Badge>
                      <RoleBadges roles={user.roles} />
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {text.phoneMeta(dateFormat.format(new Date(user.joinedAt)), user.reviewCount, user.reportsReceived)}
                    </span>
                  </span>
                  <AdminIcon name="chevronRight" className="text-[#64748b]" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {users.meta.nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link to={`/admin/users?${nextParams}`}>{text.next}</Link>
          </Button>
        </div>
      ) : null}
    </AdminPage>
```

Add, in the same file:

```tsx
/** Role badges; a plain Member gets plain text. */
export function RoleBadges({ roles }: { roles: AdminUserSummary['roles'] }) {
  const elevated = roles.filter((role) => role !== 'member')
  if (elevated.length === 0) return <span className="text-muted-foreground">{text.roles.member}</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {elevated.map((role) => (
        <Badge key={role} tone="blue">
          {text.roles[role]}
        </Badge>
      ))}
    </span>
  )
}
```

and to `copy.admin.users`:

```ts
      phoneMeta: (joined: string, reviews: number, reports: number) =>
        `Joined ${joined} · ${reviews} ${reviews === 1 ? 'review' : 'reviews'} · ${reports} ${reports === 1 ? 'report' : 'reports'}`,
```

Imports: `AdminUserSummary` from `@reprint/shared`; `Button, cn` from `@reprint/ui`; `useState` from `react`; `InitialsAvatar`; `AdminPage`; `Badge, EmptyState, USER_STATUS_TONE, numClass, tableClass, tdClass, thClass` from `./admin-ui.js`; `AdminIcon`.

Note on tests: jsdom ignores CSS, so both the table and the phone list are in the DOM; query within `getByRole('table')` or `getByRole('list', { name: 'Users' })`, and use `getAll…` for links that appear in both.

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/users-list.test.tsx`
Expected: PASS (switch older single-match link queries to scoped or `getAll` queries).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/users-list.tsx apps/web/app/components/admin/users-list.test.tsx apps/web/app/copy/index.ts
git commit -m "feat(admin): users table and phone list in the redesign style (D-201)"
```

---

### Task 7: User detail

**Files:**
- Modify: `apps/web/app/components/admin/user-detail.tsx`, `user-detail.test.tsx`

**Interfaces:**
- Consumes: `AdminPage`, `AdminCard`, `Badge`, `StatTile`, `USER_STATUS_TONE`, `RoleBadges` (Task 6, `./users-list.js`), `InitialsAvatar`
- Produces: `useUserActions(detail, canAssign, canSuspend): { buttons: ReactNode; panel: ReactNode }` (internal)

- [ ] **Step 1: Write the failing tests**

Add to `user-detail.test.tsx`:

```tsx
  it('puts the name, username, join date, and badges in the band', () => {
    renderDetail()
    expect(screen.getByRole('heading', { level: 1, name: detail.user.displayName })).toBeTruthy()
    expect(screen.getByText(new RegExp(`^@${detail.user.username} · Joined `))).toBeTruthy()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/admin/users')
  })

  it('shows Suspend as a red outline pill and the role actions beside it', () => {
    renderDetail({ canAssign: true, canSuspend: true })
    expect(screen.getByRole('button', { name: 'Suspend' }).className).toContain('text-danger')
  })

  it('opens the suspend form as a card in the page body', () => {
    renderDetail({ canAssign: true, canSuspend: true })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    expect(screen.getByRole('region', { name: 'Suspend' })).toBeTruthy()
  })

  it('shows reviews and reports as tiles', () => {
    renderDetail()
    expect(screen.getByText('Approved').tagName).toBe('DT')
    expect(screen.getByText('Received').tagName).toBe('DT')
  })
```

(Adapt helper names and the exact `actions.suspend`, `d.reviewStatuses.approved`, `d.reportsReceived` strings to the copy.)

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/user-detail.test.tsx`
Expected: FAIL

- [ ] **Step 3: Split `Actions` into buttons and a panel**

Rename `Actions` to `useUserActions(detail, canAssign, canSuspend)`: keep every hook and handler; instead of one `<section>`, return:

```tsx
  const buttons = (
    <>
      {/* the role grant/revoke Buttons (unchanged), the unsuspend, suspend, revoke-sessions, and resend Buttons (unchanged) */}
    </>
  )
  const panel =
    suspending || message || failure ? (
      <>
        {suspending ? (
          <AdminCard title={actions.suspend}>
            {/* the existing suspend <form>, minus its own border/padding classes */}
          </AdminCard>
        ) : null}
        {message ? <p role="status" className="text-sm">{message}</p> : null}
        {failure ? <p role="alert" className="text-sm text-danger">{failure}</p> : null}
      </>
    ) : null
  return { buttons, panel }
```

The role buttons stay in a `<fieldset className="contents">` with the `sr-only` legend; the Suspend button gets `variant="danger"`. Drop the visible "Actions" `h3` (the band holds the buttons).

- [ ] **Step 4: Rewrite `UserDetail`'s markup**

```tsx
  const { buttons, panel } = useUserActions(detail, canAssign, canSuspend)
  return (
    <AdminPage
      crumbs={[
        { label: copy.admin.title, to: '/admin' },
        { label: text.title, to: '/admin/users' },
        { label: `@${user.username}` },
      ]}
      leading={<InitialsAvatar name={user.displayName} colorKey={user.username} size="lg" />}
      title={user.displayName}
      lead={
        <span className="flex flex-wrap items-center gap-2.5">
          {d.joinedLine(user.username, fmtDate(user.joinedAt))}
          <Badge tone={USER_STATUS_TONE[user.status]} dot>
            {text.statuses[user.status]}
          </Badge>
          <RoleBadges roles={user.roles} />
        </span>
      }
      actions={buttons}
    >
      {panel}
      {user.status === 'suspended' || user.deletedAt ? (
        <p className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm text-[#9a3412]">
          {/* the existing suspendedUntil / suspendedIndefinitely / reason text, and deletedAt text */}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <AdminCard
            title={d.profile}
            actions={
              user.status !== 'deleted' ? (
                <Link to={`/u/${user.username}`} className="text-[15px] font-semibold text-link hover:underline">
                  {d.profileLink}
                </Link>
              ) : null
            }
          >
            <dl className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-4 gap-y-3 text-[15px]">
              <dt className="text-muted-foreground">{d.email}</dt>
              <dd className="flex flex-wrap items-center gap-2.5 break-all">
                {user.email ?? text.noEmail}
                {user.email ? (
                  user.emailVerifiedAt ? (
                    <Badge tone="green">{d.verified(fmt(user.emailVerifiedAt))}</Badge>
                  ) : (
                    <Badge tone="amber">{d.notVerified}</Badge>
                  )
                ) : null}
              </dd>
              <dt className="text-muted-foreground">{d.bio}</dt>
              <dd className="whitespace-pre-line break-words">{user.bio ?? d.noBio}</dd>
              <dt className="text-muted-foreground">{d.joined}</dt>
              <dd>{fmt(user.joinedAt)}</dd>
            </dl>
          </AdminCard>
          <AdminCard title={d.reviewsHeading}>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {REVIEW_STATUSES.map((status) => (
                <StatTile key={status} label={d.reviewStatuses[status]} value={detail.reviews[status] ?? 0} />
              ))}
            </dl>
          </AdminCard>
          {admin ? (
            <AdminCard title={d.auditHeading}>
              {admin.audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">{d.noAudit}</p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {admin.audit.map((entry) => (
                    <li key={entry.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3.5">
                      <span aria-hidden="true" className="mt-1.5 size-2.5 rounded-full border-2 border-accent bg-surface" />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[15px] font-medium break-words">{entry.action}</span>
                        <span className="text-[13px] text-muted-foreground">
                          {d.auditBy(entry.actor?.username ?? null)} ·{' '}
                          <time dateTime={entry.createdAt}>{fmt(entry.createdAt)}</time>
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </AdminCard>
          ) : (
            <p className="text-sm text-muted-foreground">{d.limitedNote}</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <AdminCard title={d.reportsHeading}>
            <dl className="grid grid-cols-2 gap-3">
              <StatTile label={d.reportsFiled} value={detail.reports.filed} />
              <StatTile label={d.reportsReceived} value={detail.reports.received} />
            </dl>
          </AdminCard>
          {admin ? (
            <AdminCard title={d.sessionsHeading}>
              {admin.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{d.noSessions}</p>
              ) : (
                <ul className="flex flex-col">
                  {admin.sessions.map((session) => (
                    <li key={session.id} className="flex flex-col gap-0.5 border-t border-[#ece8e0] py-3 first:border-t-0 first:pt-0">
                      <span className="text-[15px] font-semibold break-words">{session.device}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {d.sessionMeta(session.ip, fmt(session.lastSeenAt))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          ) : null}
        </div>
      </div>
    </AdminPage>
  )
```

Add `const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })` and `const fmtDate = (iso: string) => dateOnly.format(new Date(iso))`. Remove the "Back to users" link (the breadcrumb replaces it) and the old `h2`.

- [ ] **Step 5: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/user-detail.test.tsx`
Expected: PASS (replace the old "Back to users" assertion with the breadcrumb assertion from Step 1; keep every action test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/admin/user-detail.tsx apps/web/app/components/admin/user-detail.test.tsx
git commit -m "feat(admin): user detail with band actions and cards (D-201)"
```

---

### Task 8: Audit log

**Files:**
- Modify: `apps/web/app/components/admin/audit-log.tsx`, `audit-log.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
  it('puts the title and the CSV export in the band', () => {
    renderAudit()
    expect(screen.getByRole('heading', { level: 1, name: 'Audit log' })).toBeTruthy()
    const exportLink = screen.getByRole('link', { name: 'Export CSV' })
    expect(exportLink.className).toContain('rounded-full')
    expect(exportLink.hasAttribute('download')).toBe(true)
  })

  it('puts the filters in a named card', () => {
    renderAudit()
    expect(screen.getByRole('form', { name: 'Filter the audit log' })).toBeTruthy()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/audit-log.test.tsx`
Expected: FAIL

- [ ] **Step 3: Restyle**

Wrap in `AdminPage` (`title={text.title}`, `lead={text.lead}`, the two crumbs, and `actions`):

```tsx
      actions={
        <Button asChild variant="outline">
          {/* A plain anchor: the response is a file download, not a page. */}
          <a href={`/admin/audit.csv?${filterParams}`} download>
            {text.export}
          </a>
        </Button>
      }
```

The `Form` gets `aria-label={text.filtersLabel}` and `className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-5"`; its fields go in `<div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">` (each field `flex min-w-0 flex-col gap-1.5`), then `<div className="flex justify-end gap-2.5">` with Clear (ghost pill `Link`, when active) and Filter (submit). The table uses `tableClass`/`thClass`/`tdClass`; cells keep `align-top`; the target cell keeps `break-all`; the action cell is `font-medium`. Empty: `<EmptyState>{text.empty}</EmptyState>`. "Show more": centred outline pill. Remove the old `<p>` holding the export link.

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/audit-log.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/audit-log.tsx apps/web/app/components/admin/audit-log.test.tsx
git commit -m "feat(admin): audit log in the redesign style (D-201)"
```

---

### Task 9: Catalog

**Files:**
- Modify: `apps/web/app/components/admin/catalog-dashboard.tsx`, `catalog-dashboard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
  it('puts the title and the Merge queue and Genres pills in the band', () => {
    renderCatalog()
    expect(screen.getByRole('heading', { level: 1, name: 'Catalog' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the merge queue' }).className).toContain('rounded-full')
    expect(screen.getByRole('link', { name: 'Manage Genres and rules' }).className).toContain('rounded-full')
  })

  it('shows the totals as tiles', () => {
    renderCatalog()
    expect(screen.getByText('Books').tagName).toBe('DT')
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/catalog-dashboard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Restyle**

Wrap in `AdminPage` (`title={text.title}`, `lead={text.lead}`, crumbs, and actions: two `Button asChild variant="outline"` around the existing `/admin/catalog/merge` and `/admin/catalog/genres` links). Remove the bottom text links and the `h2`. `BookSearch` becomes `<AdminCard title={text.searchHeading}>…</AdminCard>` (its `h3` goes; keep the form, the hint, the results list, and `PagerLinks`); a result's "Public page" link becomes `Button asChild variant="outline" size="sm"`. Totals: `<dl aria-label={text.totalsLabel} className="grid gap-3 sm:grid-cols-3">` with three `StatTile`s (formatted numbers). Growth: `<AdminCard title={text.growthHeading} flush>` holding the caption as `<p className="px-5 pb-4 text-sm text-muted-foreground">` and the table (inside a focusable `div` region labelled `copy.admin.scrollableTable(text.growthHeading)`, `overflow-x-auto border-t border-border`) with `tableClass`, `thClass`, `tdClass`, `numClass` on the number columns.

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/catalog-dashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/catalog-dashboard.tsx apps/web/app/components/admin/catalog-dashboard.test.tsx
git commit -m "feat(admin): catalog page in the redesign style (D-201)"
```

---

### Task 10: Merge queue

**Files:**
- Modify: `apps/web/app/components/admin/merge-queue.tsx`, `merge-queue.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
  it('puts the title in the band and each pair in a card with pill actions', () => {
    renderQueue()
    expect(screen.getByRole('heading', { level: 1, name: 'Merge queue' })).toBeTruthy()
    const card = screen.getAllByRole('article')[0]
    if (!card) throw new Error('no card')
    expect(card.className).toContain('rounded-[18px]')
    expect(within(card).getAllByRole('link', { name: /^Edit / })[0]?.className).toContain('rounded-full')
  })

  it('shows an empty state when no pairs wait', () => {
    renderQueue({ queue: { items: [], meta: { nextCursor: null } } })
    expect(screen.getByText('No possible duplicates are waiting.')).toBeTruthy()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/merge-queue.test.tsx`
Expected: FAIL

- [ ] **Step 3: Restyle**

Wrap `MergeQueue` in `AdminPage` (`title`, `lead`, crumbs Administration / Catalog (`/admin/catalog`) / Merge queue). Empty: `EmptyState`. "Show more": centred outline pill. In `Candidate`: the article becomes `flex flex-col gap-5 rounded-[18px] border border-border bg-surface p-5 md:p-6`; its heading is an `h2` (`font-serif text-[22px] font-medium`); the reason is a `Badge`. `BookSummary`: a `rounded-xl border border-[#ece8e0] bg-[#fdfcfa] p-4` box; the title `h3` links with `hover:underline` (no underline at rest); the counts line stays; the Edit link becomes `Button asChild variant="outline" size="sm"`. The confirm section becomes `rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4` and its Merge button `variant="danger"`.

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/merge-queue.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/merge-queue.tsx apps/web/app/components/admin/merge-queue.test.tsx
git commit -m "feat(admin): merge queue cards in the redesign style (D-201)"
```

---

### Task 11: Genres and rules (tabs, filter, table, form card)

**Files:**
- Modify: `apps/web/app/routes/admin-catalog-genres.tsx` (and its test if one exists; else add cases to `genre-manager.test.tsx`)
- Modify: `apps/web/app/components/admin/genre-manager.tsx`, `genre-manager.test.tsx`

**Interfaces:**
- Produces: `GenreManager({ genres, rules, tab }: { genres: AdminGenre[]; rules: AdminSubjectRule[]; tab: 'genres' | 'rules' })`; the route reads `tab` from `?tab=rules` (anything else is `'genres'`).

- [ ] **Step 1: Write the failing tests**

In `genre-manager.test.tsx` (fixtures: a parent "Biography" with child "Memoir", "Fantasy", and an archived "Westerns"; adapt to the file's fixtures):

```tsx
  it('shows the title, the Add a Genre pill, and both tabs with counts', () => {
    renderManager({ tab: 'genres' })
    expect(screen.getByRole('heading', { level: 1, name: 'Genres and rules' })).toBeTruthy()
    const tabs = screen.getByRole('navigation', { name: 'Genres and rules sections' })
    expect(within(tabs).getByRole('link', { name: /^Genres/ }).getAttribute('aria-current')).toBe('page')
    expect(within(tabs).getByRole('link', { name: /^Subject rules/ }).getAttribute('href')).toBe(
      '/admin/catalog/genres?tab=rules',
    )
  })

  it('lists Genres in a table with children indented under their parent', () => {
    renderManager({ tab: 'genres' })
    const table = screen.getByRole('table', { name: 'Genres' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      expect.stringContaining('Biography'),
      expect.stringContaining('Memoir'),
      expect.stringContaining('Fantasy'),
    ])
  })

  it('finds a child Genre whose parent does not match', () => {
    renderManager({ tab: 'genres' })
    fireEvent.change(screen.getByLabelText('Find a Genre'), { target: { value: 'memo' } })
    const table = screen.getByRole('table', { name: 'Genres' })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByText('Memoir')).toBeTruthy()
  })

  it('hides archived Genres until Show archived is checked', () => {
    renderManager({ tab: 'genres' })
    expect(screen.queryByText('Westerns')).toBeNull()
    fireEvent.click(screen.getByLabelText('Show archived'))
    expect(screen.getByText('Westerns')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restore Westerns' })).toBeTruthy()
  })

  it('opens the add form as a card from the band button', () => {
    renderManager({ tab: 'genres' })
    expect(screen.queryByRole('region', { name: 'Add a Genre' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a Genre' }))
    expect(screen.getByRole('region', { name: 'Add a Genre' })).toBeTruthy()
  })

  it('opens a row’s edit form in place', () => {
    renderManager({ tab: 'genres' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Fantasy' }))
    expect(screen.getByRole('button', { name: 'Save Genre' })).toBeTruthy()
  })

  it('shows the rules table and add form on the rules tab', () => {
    renderManager({ tab: 'rules' })
    expect(screen.getByRole('table', { name: 'Subject rules' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Genres' })).toBeNull()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/genre-manager.test.tsx`
Expected: FAIL

- [ ] **Step 3: Route: read the tab**

In `apps/web/app/routes/admin-catalog-genres.tsx` loader, add `const tab = new URL(request.url).searchParams.get('tab') === 'rules' ? 'rules' : 'genres'`, return it, and pass `tab={loaderData.tab}` to `GenreManager`.

- [ ] **Step 4: Rewrite `GenreManager`, `GenreRow`, and `RulesSection`**

Keep `useAction`, `Messages`, `FieldError`, and `GenreForm` (drop `GenreForm`'s own border/padding classes: it now sits inside a card).

Ordering and filtering helper:

```tsx
/** Parents in name order, each followed by its children; a child whose parent is gone sorts on its own. */
export function orderGenres(genres: AdminGenre[]): AdminGenre[] {
  const byName = (a: AdminGenre, b: AdminGenre) => a.name.localeCompare(b.name)
  const ids = new Set(genres.map((genre) => genre.id))
  const tops = genres.filter((genre) => genre.parentId === null || !ids.has(genre.parentId)).sort(byName)
  return tops.flatMap((top) => [
    top,
    ...genres.filter((genre) => genre.parentId === top.id).sort(byName),
  ])
}
```

`GenreRow` renders table rows:

```tsx
function GenreRow({ genre, genres }: { genre: AdminGenre; genres: AdminGenre[] }) {
  const action = useAction()
  const [editing, setEditing] = useState(false)
  const parent = genres.find((candidate) => candidate.id === genre.parentId)
  return (
    <>
      <tr className={genre.archived ? 'bg-[#fdfcfa]' : undefined}>
        <td className={tdClass}>
          <span className={cn('flex flex-col gap-0.5', parent && 'relative pl-6 before:absolute before:top-1 before:left-1.5 before:h-3 before:w-2.5 before:rounded-bl before:border-b-[1.5px] before:border-l-[1.5px] before:border-[#c9c3b8]')}>
            <span className={cn('font-semibold', genre.archived && 'text-muted-foreground')}>{genre.name}</span>
            <code className="font-mono text-xs text-muted-foreground break-all">{genre.slug}</code>
          </span>
        </td>
        <td className={cn(tdClass, 'text-muted-foreground')}>{parent?.name ?? text.topLevel}</td>
        <td className={cn(tdClass, numClass)}>{genre.bookCount}</td>
        <td className={cn(tdClass, numClass)}>{genre.ruleCount}</td>
        <td className={tdClass}>
          <span className="flex items-center justify-end gap-2">
            {genre.archived ? <Badge>{text.archivedBadge}</Badge> : null}
            {editing || genre.archived ? null : (
              <Button type="button" variant="outline" size="sm" aria-label={text.edit(genre.name)} onClick={() => setEditing(true)}>
                {text.editShort}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={action.busy}
              aria-label={genre.archived ? text.restore(genre.name) : text.archive(genre.name)}
              onClick={() => action.send({ intent: 'editGenre', genreId: genre.id, changes: { archived: !genre.archived } })}
            >
              {genre.archived ? text.restoreShort : text.archiveShort}
            </Button>
          </span>
        </td>
      </tr>
      {editing || action.done || action.formError ? (
        <tr>
          <td colSpan={5} className={cn(tdClass, 'bg-[#fdfcfa]')}>
            {editing ? (
              <GenreForm genre={genre} parents={genres} submitLabel={text.save} busyLabel={text.saving} onCancel={() => setEditing(false)} />
            ) : null}
            <Messages action={action} />
          </td>
        </tr>
      ) : null}
    </>
  )
}
```

`GenreManager`:

```tsx
export function GenreManager({
  genres,
  rules,
  tab,
}: {
  genres: AdminGenre[]
  rules: AdminSubjectRule[]
  tab: 'genres' | 'rules'
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const findId = useId()
  const needle = query.trim().toLowerCase()
  const shown = orderGenres(genres).filter(
    (genre) =>
      (showArchived || !genre.archived) &&
      (needle === '' || genre.name.toLowerCase().includes(needle) || genre.slug.includes(needle)),
  )
  const tabClass =
    'inline-flex h-12 items-center gap-2 border-b-[3px] border-transparent text-[15px] font-medium text-[#334155] aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-foreground'
  const count = (n: number) => (
    <span className="inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-full border border-border bg-surface px-2 text-xs font-semibold">
      {n}
    </span>
  )
  return (
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[
        { label: copy.admin.title, to: '/admin' },
        { label: copy.admin.catalogNav, to: '/admin/catalog' },
        { label: text.title },
      ]}
      actions={
        tab === 'genres' ? (
          <Button type="button" onClick={() => setAdding(true)}>
            <AdminIcon name="plus" />
            {text.addHeading}
          </Button>
        ) : null
      }
      below={
        <nav aria-label={text.tabsLabel} className="flex gap-7">
          <Link to="/admin/catalog/genres" aria-current={tab === 'genres' ? 'page' : undefined} className={tabClass}>
            {text.genresHeading}
            {count(genres.length)}
          </Link>
          <Link to="/admin/catalog/genres?tab=rules" aria-current={tab === 'rules' ? 'page' : undefined} className={tabClass}>
            {text.rulesHeading}
            {count(rules.length)}
          </Link>
        </nav>
      }
    >
      {tab === 'rules' ? (
        <RulesSection genres={genres} rules={rules} />
      ) : (
        <>
          {adding ? (
            <AdminCard title={text.addHeading}>
              <GenreForm parents={genres} submitLabel={text.add} busyLabel={text.adding} onCancel={() => setAdding(false)} />
            </AdminCard>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <label htmlFor={findId} className="sr-only">{text.findLabel}</label>
            <span className="relative w-full max-w-sm">
              <AdminIcon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id={findId} type="search" value={query} placeholder={text.findLabel} className="pl-10" onChange={(event) => setQuery(event.target.value)} />
            </span>
            <label className="inline-flex items-center gap-2.5 text-[15px] font-medium">
              <Checkbox checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              {text.showArchived}
            </label>
          </div>
          {genres.length === 0 ? (
            <EmptyState>{text.empty}</EmptyState>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground">{text.noMatch}</p>
          ) : (
            <div className="overflow-hidden rounded-[18px] border border-border bg-surface">
              <ScrollRegion label={text.listLabel}>
                <table aria-label={text.listLabel} className={tableClass}>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>{text.columns.genre}</th>
                      <th scope="col" className={thClass}>{text.columns.parent}</th>
                      <th scope="col" className={cn(thClass, 'text-right')}>{text.columns.books}</th>
                      <th scope="col" className={cn(thClass, 'text-right')}>{text.columns.rules}</th>
                      <th scope="col" className={thClass}><span className="sr-only">{text.columns.actions}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((genre) => (
                      <GenreRow key={genre.id} genre={genre} genres={genres} />
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
              <p className="border-t border-border bg-[#fdfcfa] px-5 py-3.5 text-sm text-muted-foreground">
                {text.shown(shown.length, genres.length)}
              </p>
            </div>
          )}
        </>
      )}
    </AdminPage>
  )
}
```

(`@reprint/ui`'s `Checkbox` is a native `<input type="checkbox">`.) Since `ScrollRegion` already draws a border, give it `className` override support or drop the outer `div`'s border: add an optional `className` prop to `ScrollRegion` (`cn(default, className)`) and pass `className="rounded-none border-0"` here.

`RulesSection`: drop its `h3` (the tab names it) and keep the hint as the first line. Put the add-rule form first, inside `<AdminCard title={text.addRule}>` (form without its own border; grid `sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-end`, submit button in the last cell). Then the rules as a table (`aria-label={text.rulesLabel}`) in a `ScrollRegion`: columns Pattern (`<code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[13px] break-all">`), Genre, Priority (`numClass`), and a Remove `Button variant="outline" size="sm" aria-label={text.removeRule(rule.pattern)}` showing `text.removeShort`. Empty: `<EmptyState>{text.noRules}</EmptyState>`.

- [ ] **Step 5: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/genre-manager.test.tsx`
Expected: PASS (older tests that looked for the add form without clicking, or for rules on the same page, now pass `tab` and click "Add a Genre" first).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/routes/admin-catalog-genres.tsx apps/web/app/components/admin/genre-manager.tsx apps/web/app/components/admin/genre-manager.test.tsx apps/web/app/components/admin/scroll-region.tsx
git commit -m "feat(admin): Genres and rules as tabs with a filtered table and form cards (D-201)"
```

---

### Task 12: Featured content

**Files:**
- Modify: `apps/web/app/components/admin/featured-manager.tsx`, `featured-manager.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
  it('puts the title in the band and each section in a card', () => {
    renderFeatured()
    expect(screen.getByRole('heading', { level: 1, name: 'Featured content' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Featured Genres' }).className).toContain('rounded-[18px]')
    expect(screen.getByRole('region', { name: 'Featured review' }).className).toContain('rounded-[18px]')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/featured-manager.test.tsx`
Expected: FAIL

- [ ] **Step 3: Restyle**

`FeaturedManager` wraps in `AdminPage` (`title`, `lead`, crumbs Administration / Featured content); drop its `h2`. `GenrePicker` and `ReviewPicker` each swap their outer `<section aria-labelledby…>` and `h3` for `<AdminCard title={text.genresHeading}>` / `<AdminCard title={text.reviewHeading}>` (keep their bodies). The ordered Genre list's items become rows `flex items-center justify-between gap-3 rounded-xl border border-[#ece8e0] bg-[#fdfcfa] px-4 py-2.5`; the Up, Down, and Remove buttons become `variant="outline" size="sm"` (Remove `variant="danger" size="sm"`). Candidate reviews: each in a `rounded-xl border border-[#ece8e0] p-4` box; "Featured now" as `<Badge tone="green">`.

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/featured-manager.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/featured-manager.tsx apps/web/app/components/admin/featured-manager.test.tsx
git commit -m "feat(admin): featured content cards in the redesign style (D-201)"
```

---

### Task 13: System

**Files:**
- Modify: `apps/web/app/components/admin/system-dashboard.tsx`, `system-dashboard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
  it('puts the title and the update time in the band', () => {
    renderSystem()
    expect(screen.getByRole('heading', { level: 1, name: 'System' })).toBeTruthy()
    expect(screen.getByText(/^Updated at \d\d:\d\d:\d\d UTC · refreshes every 30 s$/)).toBeTruthy()
  })

  it('shows the breaker as a green badge when closed and a red one when open', () => {
    renderSystem()
    expect(screen.getByText('Closed').closest('span')?.className).toContain('text-success')
    cleanup()
    renderSystem({ source: { ...system.source, breakerOpen: true } })
    expect(screen.getByText('Open: Source calls are paused').closest('span')?.className).toContain('text-danger')
  })

  it('sets numbers in the sans, never the serif', () => {
    renderSystem()
    expect(screen.getByText('Waiting').nextElementSibling?.className).not.toContain('font-serif')
  })

  it('draws the request rate against the limit', () => {
    renderSystem()
    expect(screen.getByRole('img', { name: /% of the limit$/ })).toBeTruthy()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/system-dashboard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Rewrite the markup**

Keep the revalidation effect, formats, and `age`. Remove the local `Stat`. Return:

```tsx
  const usage = Math.min(100, Math.round((source.requestsPerSecond / source.limitPerSecond) * 100))
  const hit = searchCache.hitRate === null ? 0 : Math.round(searchCache.hitRate * 100)
  return (
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[{ label: copy.admin.title, to: '/admin' }, { label: text.title }]}
      actions={<Badge dot tone="gray">{text.updatedBadge(timeFormat.format(new Date(system.generatedAt)))}</Badge>}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <AdminCard
          title={text.sourceHeading}
          actions={
            <Badge dot tone={source.breakerOpen ? 'red' : 'green'}>
              {source.breakerOpen ? text.breakerOpen : text.breakerClosed}
            </Badge>
          }
        >
          <dl className="flex flex-col gap-3 rounded-xl border border-[#ece8e0] bg-[#fdfcfa] px-4 py-3.5">
            <dt className="text-[13px] text-muted-foreground">{text.requestsPerSecond}</dt>
            <dd className="flex items-baseline gap-2 text-[28px] leading-none font-semibold tabular-nums">
              {source.requestsPerSecond.toFixed(2)}
              <span className="text-[15px] font-medium text-muted-foreground">{text.ofLimit(source.limitPerSecond)}</span>
            </dd>
            <dd>
              <span role="img" aria-label={text.usage(usage)} className="block h-2 overflow-hidden rounded-full bg-[#ece8e0]">
                <span className={cn('block h-full rounded-full bg-accent', barWidth(usage))} />
              </span>
            </dd>
          </dl>
        </AdminCard>
        <AdminCard title={text.cacheHeading}>
          <dl className="flex flex-col gap-3 rounded-xl border border-[#ece8e0] bg-[#fdfcfa] px-4 py-3.5">
            <dt className="text-[13px] text-muted-foreground">{text.hitRate}</dt>
            <dd className="text-[28px] leading-none font-semibold tabular-nums">
              {searchCache.hitRate === null ? text.noLookups : percentFormat.format(searchCache.hitRate)}
            </dd>
            <dd>
              <span role="img" aria-label={percentFormat.format(hit / 100)} className="block h-2 overflow-hidden rounded-full bg-[#ece8e0]">
                <span className={cn('block h-full rounded-full bg-success', barWidth(hit))} />
              </span>
            </dd>
            <dd className="text-[13px] text-muted-foreground">{text.lookups(searchCache.hits, searchCache.misses)}</dd>
          </dl>
        </AdminCard>
      </div>
      <AdminCard
        title={text.queueHeading}
        actions={
          <span className="text-sm text-muted-foreground">
            {text.oldestWaiting}: <span className="font-semibold text-foreground">{age(queue.oldestWaitingSeconds)}</span>
          </span>
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
```

Bar widths: inline `style` is banned (D-185) and Tailwind cannot take a runtime number, so `barWidth` rounds the percentage to the nearest 5 and maps it to a fixed width class (define it above the component; import `cn` from `@reprint/ui`):

```tsx
const BAR_WIDTHS = [
  'w-0', 'w-[5%]', 'w-[10%]', 'w-[15%]', 'w-[20%]', 'w-[25%]', 'w-[30%]', 'w-[35%]', 'w-[40%]', 'w-[45%]',
  'w-[50%]', 'w-[55%]', 'w-[60%]', 'w-[65%]', 'w-[70%]', 'w-[75%]', 'w-[80%]', 'w-[85%]', 'w-[90%]', 'w-[95%]', 'w-full',
] as const
const barWidth = (percent: number) => BAR_WIDTHS[Math.round(Math.min(100, Math.max(0, percent)) / 5)] ?? 'w-0'
```

Add a unit test: `expect(barWidth(42)).toBe('w-[40%]'); expect(barWidth(0)).toBe('w-0'); expect(barWidth(100)).toBe('w-full')` (export `barWidth`).

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/system-dashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/admin/system-dashboard.tsx apps/web/app/components/admin/system-dashboard.test.tsx
git commit -m "feat(admin): system page with badges, bars, and sans numbers (D-201)"
```

---

### Task 14: Edit Book header into the band

**Files:**
- Modify: `apps/web/app/components/admin/book-editor.tsx`, `book-editor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('puts the cover, Edit Book eyebrow, title, and View the Book page in the band', () => {
    renderEditor()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Catalog' }).getAttribute('href')).toBe('/admin/catalog')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'View the Book page' }).className).toContain('rounded-full')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/book-editor.test.tsx`
Expected: FAIL (no breadcrumb).

- [ ] **Step 3: Move the header**

Replace the `<header>…</header>` and the phone-only back link in `BookEditor`'s return with an `AdminPage` wrapper:

```tsx
    <AdminPage
      crumbs={[
        { label: copy.admin.title, to: '/admin' },
        { label: copy.admin.catalogNav, to: '/admin/catalog' },
        { label: text.title },
      ]}
      leading={
        <Cover cover={book.cover} title={book.title} authorName={authors[0]} slug={book.slug} size="small" className="w-14 md:w-16" />
      }
      title={book.title}
      lead={
        <span className="flex flex-col gap-1">
          {authors.length > 0 ? <span>{authors.join(', ')}</span> : null}
          <SaveStatus />
        </span>
      }
      actions={
        <Button asChild variant="outline">
          <Link to={`/books/${book.slug}`}>{text.back}</Link>
        </Button>
      }
    >
      {/* the existing grid with EditForm and the side cards, unchanged */}
    </AdminPage>
```

The "Edit Book" eyebrow is now the last breadcrumb. Remove the old outer `div`.

- [ ] **Step 4: Run the tests**

Run: `$N24 pnpm --filter web exec vitest run app/components/admin/book-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the whole web suite and commit**

Run: `$N24 pnpm --filter web exec vitest run`
Expected: PASS (all files)

```bash
git add apps/web/app/components/admin/book-editor.tsx apps/web/app/components/admin/book-editor.test.tsx
git commit -m "feat(admin): Edit Book header in the band (D-201)"
```

---

### Task 15: e2e, phone sweep, docs, and visual check

**Files:**
- Modify: `e2e/specs/admin.spec.ts`, `e2e/specs/a11y-pages.spec.ts`, and any spec that asserts the "Administration" `h1` or a changed link name (`grep -rn "Administration\|Back to users\|Open the merge queue" e2e/specs`)
- Modify: `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/TASKS.md`, `docs/PROGRESS.md`

- [ ] **Step 1: Update the admin e2e sweep**

In `e2e/specs/admin.spec.ts` replace `adminPages` with titled entries and assert each page's own `h1`, at desktop and at phone width, with no sideways page scroll on phones:

```ts
const adminPages: [string, string][] = [
  ['/admin', 'Dashboard'],
  ['/admin/reviews', 'Review queue'],
  ['/admin/reports', 'Reports queue'],
  ['/admin/users', 'Users'],
  ['/admin/audit', 'Audit log'],
  ['/admin/catalog', 'Catalog'],
  ['/admin/catalog/merge', 'Merge queue'],
  ['/admin/catalog/genres', 'Genres and rules'],
  ['/admin/catalog/genres?tab=rules', 'Genres and rules'],
  ['/admin/featured', 'Featured content'],
  ['/admin/system', 'System'],
]

test('every admin page has no serious accessibility issues', async ({ page }) => {
  const admin = await registerVerifiedMember(page, 'admin')
  await grantAdmin(admin.email)
  for (const [path, title] of adminPages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expectNoA11yViolations(page)
  }
})

test('admin pages never scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const admin = await registerVerifiedMember(page, 'adminphone')
  await grantAdmin(admin.email)
  for (const [path, title] of adminPages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
    await expectNoA11yViolations(page)
  }
})
```

In the role-flow test and in `a11y-pages.spec.ts`, replace `name: 'Administration'` with the `h1` of the page visited (`'Dashboard'` for `/admin`, `'Users'` for `/admin/users`, and so on). Update any spec that clicked "Back to users" to use the breadcrumb link `Users`.

- [ ] **Step 2: Run the admin and a11y specs**

Run: `$N24 node e2e/run.mjs specs/admin.spec.ts specs/a11y-pages.spec.ts specs/moderation.spec.ts specs/reports.spec.ts`
Expected: PASS on chromium, webkit, and mobile.

- [ ] **Step 3: Docs**

- `docs/DESIGN.md`: rewrite "Admin table pattern" as "Admin section": the `AdminPage` band (breadcrumb, `h1` 34/44 px, lead, actions, tabs slot), the grouped nav with icons and counts (disclosure below `lg`), the building blocks (`AdminCard`, `Badge` tones, `StatTile` in sans, table classes, `EmptyState`, `Kbd`), pills for actions, row actions as small buttons (no dropdown menu), the Users phone list, Genres tabs. Add the admin building blocks to the component inventory table.
- `docs/DECISIONS.md`: append D-201 (Status: Decided (owner); Decision: the shell, nav counts from `/v1/mod/stats` only for moderators and silently off on failure, building blocks, no dropdown, Users phone list, Genres tabs via `?tab=rules` with a browser-side filter, the dashboard's "Waiting longest" from `/v1/mod/reviews?limit=3`; Why: the owner approved the mockups; Affects: the files above).
- `docs/TASKS.md`: append `- [x] M9-T20 · Admin section in the redesign style · deps: M9-T19 · PRD: §7.10, §7.11` with Accept bullets for the shell, every page, and the tests.
- `docs/PROGRESS.md`: a dated M9-T20 note.

- [ ] **Step 4: Visual check**

Write a throwaway (uncommitted) Playwright spec that signs in as an Admin on the isolated e2e stack and screenshots every admin page at 1440 and 390 px into the scratchpad; compare each with its mockup on the canvas. Fix any drift with a test-first change. Delete the throwaway spec.

- [ ] **Step 5: Full checks**

Run: `$N24 pnpm check` then `$N24 node e2e/run.mjs`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add e2e/specs docs/DESIGN.md docs/DECISIONS.md docs/TASKS.md docs/PROGRESS.md
git commit -m "test(e2e), docs: admin pages by their own titles, phone sweep, D-201"
```
