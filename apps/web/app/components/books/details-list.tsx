/** Label and value pairs as a description list; rows without a value are left out. */
export function DetailsList({
  rows,
}: {
  rows: { label: string; value: string | null | undefined }[]
}) {
  const shown = rows.filter((row) => row.value)
  if (shown.length === 0) return null
  return (
    <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
      {shown.map((row) => (
        <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          <dd className="text-base break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
