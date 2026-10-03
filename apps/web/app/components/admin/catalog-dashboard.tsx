import type { AdminCatalogStats } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ScrollRegion } from './scroll-region.js'

const text = copy.admin.catalog

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const numberFormat = new Intl.NumberFormat('en-US')

function monthLabel(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`))
}

/** Catalog size and what was added each month (PRD §6, §7.11). */
export function CatalogDashboard({ stats }: { stats: AdminCatalogStats }) {
  const grew = stats.monthly.some((row) => row.books + row.editions + row.authors > 0)
  return (
    <section aria-labelledby="catalog-heading" className="flex flex-col gap-6">
      <h2 id="catalog-heading" className="text-2xl font-semibold">
        {text.title}
      </h2>
      <dl aria-label={text.totalsLabel} className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ['books', text.books],
            ['editions', text.editions],
            ['authors', text.authors],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="rounded-md border border-border p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-3xl font-semibold">
              {numberFormat.format(stats.totals[key])}
            </dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="growth-heading" className="flex flex-col gap-3">
        <h3 id="growth-heading" className="text-xl font-semibold">
          {text.growthHeading}
        </h3>
        {grew ? (
          <ScrollRegion label={text.growthHeading}>
            <table className="w-full text-left text-sm">
              <caption className="pb-2 text-left text-muted-foreground">
                {text.growthCaption}
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {text.month}
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">
                    {text.books}
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">
                    {text.editions}
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    {text.authors}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.monthly.map((row) => (
                  <tr key={row.month} className="border-b border-border">
                    <th scope="row" className="py-2 pr-4 font-normal">
                      <time dateTime={row.month}>{monthLabel(row.month)}</time>
                    </th>
                    <td className="py-2 pr-4 text-right">{numberFormat.format(row.books)}</td>
                    <td className="py-2 pr-4 text-right">{numberFormat.format(row.editions)}</td>
                    <td className="py-2 text-right">{numberFormat.format(row.authors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : (
          <p className="text-muted-foreground">{text.noGrowth}</p>
        )}
      </section>
      <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link to="/admin/catalog/merge" className="underline">
          {text.mergeLink}
        </Link>
        <Link to="/admin/catalog/genres" className="underline">
          {text.genresLink}
        </Link>
      </p>
    </section>
  )
}
