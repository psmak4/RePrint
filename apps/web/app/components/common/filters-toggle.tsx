import { buttonVariants, cn } from '@reprint/ui'
import { AdminIcon } from '../admin/icons.js'

/** The one filters toggle on phones (D-214): a full-width outline pill with a chevron. */
export const filtersToggleClass = cn(
  buttonVariants({ variant: 'outline' }),
  'w-full justify-between',
)

/** Its content: the filter icon and label on the left, the chevron on the right. */
export function FiltersToggleLabel({ label }: { label: string }) {
  return (
    <>
      <span className="inline-flex items-center gap-2.5">
        <AdminIcon name="filter" />
        {label}
      </span>
      <AdminIcon name="chevronDown" />
    </>
  )
}
