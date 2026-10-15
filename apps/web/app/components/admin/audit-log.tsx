import { type AdminAuditResponse, AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@reprint/shared'
import { Button, cn, Input, Label, Select } from '@reprint/ui'
import { useState } from 'react'
import { Form, Link } from 'react-router'
import { adminCopy } from '../../copy/admin.js'
import { ShowMore } from '../common/show-more.js'
import { AdminPage } from './admin-page.js'
import {
  EmptyState,
  FiltersToggle,
  filtersFormClass,
  tableClass,
  tdClass,
  thClass,
} from './admin-ui.js'
import { ScrollRegion } from './scroll-region.js'

const field = 'flex min-w-0 flex-col gap-1.5'

const text = adminCopy.audit

type Filters = {
  actor: string
  action: string
  targetType: string
  targetId: string
  from: string
  to: string
}

const timeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
})

function Values({ label, values }: { label: string; values: Record<string, unknown> | null }) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd>
        {values ? (
          <pre className="whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(values, null, 2)}
          </pre>
        ) : (
          <span className="text-muted-foreground">{text.noValues}</span>
        )}
      </dd>
    </div>
  )
}

/** `/admin/audit`: filters live in the URL; a plain GET form drives them (PRD §7.11). */
export function AuditLog({ entries, filters }: { entries: AdminAuditResponse; filters: Filters }) {
  const active = Object.values(filters).some(Boolean)
  const [filtersOpen, setFiltersOpen] = useState(active)
  const filterParams = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) filterParams.set(key, value)
  const nextParams = new URLSearchParams(filterParams)
  if (entries.meta.nextCursor) nextParams.set('cursor', entries.meta.nextCursor)

  return (
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[{ label: adminCopy.title, to: '/admin' }, { label: text.title }]}
      actions={
        <Button asChild variant="outline">
          {/* A plain anchor: the response is a file download, not a page. */}
          <a href={`/admin/audit.csv?${filterParams}`} download>
            {text.export}
          </a>
        </Button>
      }
    >
      <FiltersToggle
        open={filtersOpen}
        onToggle={() => setFiltersOpen(!filtersOpen)}
        controls="audit-filters"
        label={text.filtersToggle}
      />
      <Form
        id="audit-filters"
        method="get"
        aria-label={text.filtersLabel}
        className={filtersFormClass(filtersOpen)}
      >
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className={field}>
            <Label htmlFor="audit-actor">{text.actorLabel}</Label>
            <Input
              id="audit-actor"
              name="actor"
              type="search"
              defaultValue={filters.actor}
              maxLength={100}
            />
          </div>
          <div className={field}>
            <Label htmlFor="audit-action">{text.actionLabel}</Label>
            <Select id="audit-action" name="action" defaultValue={filters.action}>
              <option value="">{text.any}</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </Select>
          </div>
          <div className={field}>
            <Label htmlFor="audit-target-type">{text.targetTypeLabel}</Label>
            <Select id="audit-target-type" name="targetType" defaultValue={filters.targetType}>
              <option value="">{text.any}</option>
              {AUDIT_TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>
          <div className={field}>
            <Label htmlFor="audit-target-id">{text.targetIdLabel}</Label>
            <Input id="audit-target-id" name="targetId" defaultValue={filters.targetId} />
          </div>
          <div className={field}>
            <Label htmlFor="audit-from">{text.fromLabel}</Label>
            <Input id="audit-from" name="from" type="date" defaultValue={filters.from} />
          </div>
          <div className={field}>
            <Label htmlFor="audit-to">{text.toLabel}</Label>
            <Input id="audit-to" name="to" type="date" defaultValue={filters.to} />
          </div>
        </div>
        <div className="flex justify-end gap-2.5">
          {active ? (
            <Button asChild variant="ghost">
              <Link to="/admin/audit">{text.clear}</Link>
            </Button>
          ) : null}
          <Button type="submit">{text.filter}</Button>
        </div>
      </Form>
      {entries.items.length === 0 ? (
        <EmptyState>{text.empty}</EmptyState>
      ) : (
        <ScrollRegion label={text.listLabel}>
          <table aria-label={text.listLabel} className={tableClass}>
            <thead>
              <tr>
                {(['time', 'actor', 'action', 'target', 'ip', 'changes'] as const).map((column) => (
                  <th key={column} scope="col" className={thClass}>
                    {text.columns[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.items.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-tint">
                  <td className={cn(tdClass, 'align-top whitespace-nowrap')}>
                    <time dateTime={entry.createdAt}>
                      {timeFormat.format(new Date(entry.createdAt))}
                    </time>
                  </td>
                  <td className={cn(tdClass, 'align-top')}>
                    {entry.actor?.username ?? text.noActor}
                  </td>
                  <td className={cn(tdClass, 'align-top font-medium')}>{entry.action}</td>
                  <td className={cn(tdClass, 'align-top break-all')}>
                    {entry.targetType}
                    {entry.targetId ? (
                      <span className="block text-[13px] text-muted-foreground">
                        {entry.targetId}
                      </span>
                    ) : null}
                  </td>
                  <td className={cn(tdClass, 'align-top')}>{entry.ip ?? text.noIp}</td>
                  <td className={cn(tdClass, 'align-top')}>
                    <dl className="flex flex-col gap-1">
                      <Values label={text.before} values={entry.before} />
                      <Values label={text.after} values={entry.after} />
                    </dl>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      {entries.meta.nextCursor ? (
        <ShowMore to={`/admin/audit?${nextParams}`}>{text.next}</ShowMore>
      ) : null}
    </AdminPage>
  )
}
