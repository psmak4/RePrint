/** A row of short key facts beside the cover (first published, pages, and so on). */
export function FactsRow({ facts }: { facts: { label: string; value: string }[] }) {
  if (facts.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap">
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col">
          <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {fact.label}
          </dt>
          <dd className="text-base">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
