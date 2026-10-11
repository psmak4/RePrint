import { ADMIN_USER_STATUSES, type AdminUsersResponse, ASSIGNABLE_ROLES } from '@reprint/shared'
import { Button, Input, Label, Select } from '@reprint/ui'
import { Form, Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ScrollRegion } from './scroll-region.js'

const text = copy.admin.users

type Filters = { q: string; role: string; status: string; joinedFrom: string; joinedTo: string }

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

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
  const nextParams = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) nextParams.set(key, value)
  if (users.meta.nextCursor) nextParams.set('cursor', users.meta.nextCursor)

  return (
    <section aria-labelledby="users-heading" className="flex flex-col gap-4">
      <h2
        id="users-heading"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.title}
      </h2>
      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-q">
            {canSearchEmail ? text.searchLabel : text.searchLabelLimited}
          </Label>
          <Input id="users-q" name="q" type="search" defaultValue={filters.q} maxLength={100} />
        </div>
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-from">{text.joinedFromLabel}</Label>
          <Input id="users-from" name="joinedFrom" type="date" defaultValue={filters.joinedFrom} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-to">{text.joinedToLabel}</Label>
          <Input id="users-to" name="joinedTo" type="date" defaultValue={filters.joinedTo} />
        </div>
        <Button type="submit">{text.filter}</Button>
        {active ? (
          <Link to="/admin/users" className="text-sm text-link underline">
            {text.clear}
          </Link>
        ) : null}
      </Form>
      {users.items.length === 0 ? (
        <p className="text-muted-foreground">{text.empty}</p>
      ) : (
        <ScrollRegion label={text.listLabel}>
          <table aria-label={text.listLabel} className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-3 pr-4">
                  {text.columns.user}
                </th>
                {canSearchEmail ? (
                  <th scope="col" className="py-3 pr-4">
                    {text.columns.email}
                  </th>
                ) : null}
                <th scope="col" className="py-3 pr-4">
                  {text.columns.status}
                </th>
                <th scope="col" className="py-3 pr-4">
                  {text.columns.roles}
                </th>
                <th scope="col" className="py-3 pr-4">
                  {text.columns.joined}
                </th>
                <th scope="col" className="py-3 pr-4">
                  {text.columns.reviews}
                </th>
                <th scope="col" className="py-2">
                  {text.columns.reports}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.items.map((user) => (
                <tr key={user.id} className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 font-medium">
                    <Link to={`/admin/users/${user.id}`} className="underline">
                      {user.displayName}
                    </Link>
                    <span className="block text-muted-foreground">@{user.username}</span>
                  </th>
                  {canSearchEmail ? (
                    <td className="py-3 pr-4 break-all">{user.email ?? text.noEmail}</td>
                  ) : null}
                  <td className="py-3 pr-4">{text.statuses[user.status]}</td>
                  <td className="py-3 pr-4">
                    {user.roles.map((role) => text.roles[role]).join(', ')}
                  </td>
                  <td className="py-3 pr-4">
                    <time dateTime={user.joinedAt}>
                      {dateFormat.format(new Date(user.joinedAt))}
                    </time>
                  </td>
                  <td className="py-3 pr-4">{user.reviewCount}</td>
                  <td className="py-2">{user.reportsReceived}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      {users.meta.nextCursor ? (
        <Link to={`/admin/users?${nextParams}`} className="text-sm text-link underline">
          {text.next}
        </Link>
      ) : null}
    </section>
  )
}
