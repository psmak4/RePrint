/** Label and value pairs as a description list in two columns; rows without a value are left out. */
export function DetailsList({
  rows,
}: {
  rows: { label: string; value: string | null | undefined }[]
}) {
  const shown = rows.filter((row) => row.value)
  if (shown.length === 0) return null
  return (
    <dl className="grid gap-x-10 md:grid-cols-2">
      {shown.map((row) => (
        <div
          key={row.label}
          className="flex justify-between gap-4 border-b border-border py-3 text-[15px] md:grid md:grid-cols-[150px_minmax(0,1fr)] md:py-3.5"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right break-words md:text-left">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
