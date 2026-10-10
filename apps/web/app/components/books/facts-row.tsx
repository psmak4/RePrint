/**
 * A row of short key facts beside the cover (first published, pages, and so on), split by thin
 * rules. On phones it becomes a 2 by 2 grid of tiles.
 */
export function FactsRow({ facts }: { facts: { label: string; value: string }[] }) {
  if (facts.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border text-left md:flex md:flex-wrap md:gap-y-3 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex flex-col gap-0.5 bg-surface px-3.5 py-3 last:odd:col-span-2 md:gap-1 md:border-l md:border-[#d9d4ca] md:bg-transparent md:px-6 md:py-0 md:first:border-l-0 md:first:pl-0"
        >
          <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase md:text-xs">
            {fact.label}
          </dt>
          <dd className="text-[15px] font-medium md:text-base">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
