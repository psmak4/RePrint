import { buttonVariants } from '@reprint/ui'
import { Link } from 'react-router'

/**
 * The one pager (D-214): Previous and Next as outline pills, with "Page N of M" (or "Page N") between.
 * Every paged list uses it; lists that grow in place use `ShowMore`.
 */
export function Pager({
  label,
  previous,
  next,
  status,
}: {
  label: string
  previous: { href: string; text: string } | null
  next: { href: string; text: string } | null
  status: string
}) {
  const pill = buttonVariants({ variant: 'outline' })
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4">
      {previous ? (
        <Link rel="prev" to={previous.href} className={pill}>
          {previous.text}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{status}</span>
      {next ? (
        <Link rel="next" to={next.href} className={pill}>
          {next.text}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
