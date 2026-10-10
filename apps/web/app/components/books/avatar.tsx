import { cn } from '@reprint/ui'
import { avatarClass, initialsOf } from '../../lib/avatar.js'

const SIZES = {
  xs: 'size-6 text-[11px]',
  sm: 'size-8 text-[13px]',
  md: 'size-10 text-sm',
  lg: 'size-16 font-serif text-[22px]',
  xl: 'size-[88px] font-serif text-[32px]',
} as const

/** Initials on a pale circle. Decorative: the name always sits beside it. */
export function InitialsAvatar({
  name,
  colorKey = name,
  size = 'md',
  className,
}: {
  name: string
  /** What picks the colour (a username is steadier than a display name). */
  colorKey?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-foreground',
        SIZES[size],
        avatarClass(colorKey),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
