import { cn } from '@reprint/ui'
import { copy } from '../../copy/index.js'

/** A shield and "Read by a moderator": the promise behind every published review. */
export function TrustBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium',
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 text-success"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      {copy.redesign.trustBadge}
    </span>
  )
}
