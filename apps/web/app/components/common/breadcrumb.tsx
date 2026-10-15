import { Link } from 'react-router'
import { copy } from '../../copy/index.js'

/** One step of a trail: a link, or the current page when it has no `to`. */
export type Crumb = { label: string; to?: string }

/**
 * The trail that opens every page band (D-214): Discover, then the steps the page passes, ending
 * with the current page, which is plain text with `aria-current="page"`.
 */
export function Breadcrumb({ trail }: { trail: Crumb[] }) {
  const crumbs: Crumb[] = [{ label: copy.shell.nav.discover, to: '/' }, ...trail]
  return (
    <nav aria-label={copy.shell.breadcrumbLabel} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {crumbs.map((crumb, index) => (
          <li
            key={`${crumb.to ?? 'here'}:${crumb.label}`}
            className="flex min-w-0 items-center gap-2"
          >
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {crumb.to ? (
              <Link to={crumb.to} className="text-strong hover:text-foreground hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="break-words text-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
