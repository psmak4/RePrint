import { type AdminAuditResponse, AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@reprint/shared'
import { Button, Input, Label } from '@reprint/ui'
import { Form, Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ScrollRegion } from './scroll-region.js'

const text = copy.admin.audit

const SELECT_CLASS =
  'h-11 rounded-[10px] border border-input-border bg-surface px-3 text-[15px] text-foreground'

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
  const filterParams = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) filterParams.set(key, value)
  const nextParams = new URLSearchParams(filterParams)
  if (entries.meta.nextCursor) nextParams.set('cursor', entries.meta.nextCursor)

  return (
    <section aria-labelledby="audit-heading" className="flex flex-col gap-4">
      <h2
        id="audit-heading"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.title}
      </h2>
      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-actor">{text.actorLabel}</Label>
          <Input
            id="audit-actor"
            name="actor"
            type="search"
            defaultValue={filters.actor}
            maxLength={100}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-action">{text.actionLabel}</Label>
          <select
            id="audit-action"
            name="action"
            defaultValue={filters.action}
            className={SELECT_CLASS}
          >
            <option value="">{text.any}</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-target-type">{text.targetTypeLabel}</Label>
          <select
            id="audit-target-type"
            name="targetType"
            defaultValue={filters.targetType}
            className={SELECT_CLASS}
          >
            <option value="">{text.any}</option>
            {AUDIT_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-target-id">{text.targetIdLabel}</Label>
          <Input id="audit-target-id" name="targetId" defaultValue={filters.targetId} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-from">{text.fromLabel}</Label>
          <Input id="audit-from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-to">{text.toLabel}</Label>
          <Input id="audit-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <Button type="submit">{text.filter}</Button>
        {active ? (
          <Link to="/admin/audit" className="text-sm text-link underline">
            {text.clear}
          </Link>
        ) : null}
      </Form>
      <p>
        {/* A plain anchor: the response is a file download, not a page. */}
        <a
          href={`/admin/audit.csv?${filterParams}`}
          className="text-sm text-link underline"
          download
        >
          {text.export}
        </a>
      </p>
      {entries.items.length === 0 ? (
        <p className="text-muted-foreground">{text.empty}</p>
      ) : (
        <ScrollRegion label={text.listLabel}>
          <table aria-label={text.listLabel} className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {(['time', 'actor', 'action', 'target', 'ip', 'changes'] as const).map((column) => (
                  <th key={column} scope="col" className="py-3 pr-4">
                    {text.columns[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.items.map((entry) => (
                <tr key={entry.id} className="border-b border-border align-top">
                  <td className="py-3 pr-4">
                    <time dateTime={entry.createdAt}>
                      {timeFormat.format(new Date(entry.createdAt))}
                    </time>
                  </td>
                  <td className="py-3 pr-4">{entry.actor?.username ?? text.noActor}</td>
                  <td className="py-3 pr-4 font-medium">{entry.action}</td>
                  <td className="py-3 pr-4 break-all">
                    {entry.targetType}
                    {entry.targetId ? (
                      <span className="block text-muted-foreground">{entry.targetId}</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">{entry.ip ?? text.noIp}</td>
                  <td className="py-2">
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
        <Link to={`/admin/audit?${nextParams}`} className="text-sm text-link underline">
          {text.next}
        </Link>
      ) : null}
    </section>
  )
}
