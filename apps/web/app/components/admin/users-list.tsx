import {
  ADMIN_USER_STATUSES,
  type AdminUserSummary,
  type AdminUsersResponse,
  ASSIGNABLE_ROLES,
} from '@reprint/shared'
import { Button, cn, Input, Label, Select } from '@reprint/ui'
import { useState } from 'react'
import { Form, Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { InitialsAvatar } from '../books/avatar.js'
import { AdminPage } from './admin-page.js'
import {
  Badge,
  EmptyState,
  numClass,
  tableClass,
  tdClass,
  thClass,
  USER_STATUS_TONE,
} from './admin-ui.js'
import { AdminIcon } from './icons.js'
import { ScrollRegion } from './scroll-region.js'

const text = copy.admin.users

type Filters = { q: string; role: string; status: string; joinedFrom: string; joinedTo: string }

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

/** Role badges; a plain Member gets plain text. */
export function RoleBadges({ roles }: { roles: AdminUserSummary['roles'] }) {
  const elevated = roles.filter((role) => role !== 'member')
  if (elevated.length === 0) {
    return <span className="text-muted-foreground">{text.roles.member}</span>
  }
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

const field = 'flex min-w-0 flex-col gap-1.5'

/** `/admin/users`: search and filter state lives in the URL; a plain GET form drives it (PRD §7.11). */
export function UsersList({
  users,
  filters,
  canSearchEmail,
}: {
  users: AdminUsersResponse
  filters: Filters
  canSearchEmail: boolean
}) {
  const active = Object.values(filters).some(Boolean)
  const [filtersOpen, setFiltersOpen] = useState(active)
  const nextParams = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) nextParams.set(key, value)
  if (users.meta.nextCursor) nextParams.set('cursor', users.meta.nextCursor)

  return (
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
          <div className={cn(field, 'sm:col-span-2 lg:col-span-1')}>
            <Label htmlFor="users-q">
              {canSearchEmail ? text.searchLabel : text.searchLabelLimited}
            </Label>
            <Input id="users-q" name="q" type="search" defaultValue={filters.q} maxLength={100} />
          </div>
          <div className={field}>
            <Label htmlFor="users-role">{text.roleLabel}</Label>
            <Select id="users-role" name="role" defaultValue={filters.role}>
              <option value="">{text.any}</option>
              <option value="member">{text.roles.member}</option>
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {text.roles[role]}
                </option>
              ))}
            </Select>
          </div>
          <div className={field}>
            <Label htmlFor="users-status">{text.statusLabel}</Label>
            <Select id="users-status" name="status" defaultValue={filters.status}>
              <option value="">{text.any}</option>
              {ADMIN_USER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {text.statuses[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className={field}>
            <Label htmlFor="users-from">{text.joinedFromLabel}</Label>
            <Input
              id="users-from"
              name="joinedFrom"
              type="date"
              defaultValue={filters.joinedFrom}
            />
          </div>
          <div className={field}>
            <Label htmlFor="users-to">{text.joinedToLabel}</Label>
            <Input id="users-to" name="joinedTo" type="date" defaultValue={filters.joinedTo} />
          </div>
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
                    <th scope="col" className={thClass}>
                      {text.columns.user}
                    </th>
                    {canSearchEmail ? (
                      <th scope="col" className={thClass}>
                        {text.columns.email}
                      </th>
                    ) : null}
                    <th scope="col" className={thClass}>
                      {text.columns.status}
                    </th>
                    <th scope="col" className={thClass}>
                      {text.columns.roles}
                    </th>
                    <th scope="col" className={thClass}>
                      {text.columns.joined}
                    </th>
                    <th scope="col" className={cn(thClass, 'text-right')}>
                      {text.columns.reviews}
                    </th>
                    <th scope="col" className={cn(thClass, 'text-right')}>
                      {text.columns.reports}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((user) => (
                    <tr key={user.id} className="hover:bg-[#fdfcfa]">
                      <th scope="row" className={cn(tdClass, 'text-left font-normal')}>
                        <span className="flex items-center gap-3">
                          <InitialsAvatar
                            name={user.displayName}
                            colorKey={user.username}
                            size="sm"
                          />
                          <span className="flex min-w-0 flex-col">
                            <Link
                              to={`/admin/users/${user.id}`}
                              className="font-semibold whitespace-nowrap hover:underline"
                            >
                              {user.displayName}
                            </Link>
                            <span className="text-[13px] whitespace-nowrap text-muted-foreground">
                              @{user.username}
                            </span>
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
                        <time dateTime={user.joinedAt}>
                          {dateFormat.format(new Date(user.joinedAt))}
                        </time>
                      </td>
                      <td className={cn(tdClass, numClass)}>{user.reviewCount}</td>
                      <td className={cn(tdClass, numClass)}>{user.reportsReceived}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
          <ul
            aria-label={text.listLabel}
            className="overflow-hidden rounded-[18px] border border-border bg-surface md:hidden"
          >
            {users.items.map((user) => (
              <li key={user.id} className="border-t border-[#ece8e0] first:border-t-0">
                <Link
                  to={`/admin/users/${user.id}`}
                  className="grid grid-cols-[40px_minmax(0,1fr)_20px] items-center gap-3 px-4 py-3.5"
                >
                  <InitialsAvatar name={user.displayName} colorKey={user.username} size="md" />
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-semibold break-words">
                      {user.displayName}{' '}
                      <span className="font-normal text-muted-foreground">@{user.username}</span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={USER_STATUS_TONE[user.status]} dot>
                        {text.statuses[user.status]}
                      </Badge>
                      <RoleBadges roles={user.roles} />
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {text.phoneMeta(
                        dateFormat.format(new Date(user.joinedAt)),
                        user.reviewCount,
                        user.reportsReceived,
                      )}
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
  )
}
