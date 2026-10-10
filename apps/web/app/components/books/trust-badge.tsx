import { cn } from '@reprint/ui'
import { copy } from '../../copy/index.js'

function Shield({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('shrink-0 text-[#16a34a]', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

/**
 * The shield and the moderation promise. `pill` is the green badge for the Discover hero; `inline`
 * is the quiet line beside the Book page's Reviews heading.
 */
export function TrustBadge({
  label = copy.redesign.trustBadge,
  variant = 'pill',
  className,
}: {
  label?: string
  variant?: 'pill' | 'inline'
  className?: string
}) {
  if (variant === 'inline') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-sm text-muted-foreground', className)}
      >
        <Shield className="size-4" />
        {label}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[#a7f3d0] bg-[#ecfdf3] py-1.5 pr-3.5 pl-2.5 text-[13px] font-medium text-success md:text-sm',
        className,
      )}
    >
      <Shield className="size-4 md:size-[18px]" />
      {label}
    </span>
  )
}
