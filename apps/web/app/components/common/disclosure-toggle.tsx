import { buttonVariants, cn } from '@reprint/ui'
import { AdminIcon, type AdminIconName } from '../admin/icons.js'

/**
 * The one disclosure toggle on phones (D-214): a full-width outline pill, an icon and label on the
 * left, a chevron on the right. Search's and the admin lists' filters and the admin menu use it.
 */
export const disclosureToggleClass = cn(
  buttonVariants({ variant: 'outline' }),
  'w-full justify-between',
)

/** Its content: the icon and label on the left, the chevron on the right. */
export function DisclosureToggleLabel({ icon, label }: { icon: AdminIconName; label: string }) {
  return (
    <>
      <span className="inline-flex items-center gap-2.5">
        <AdminIcon name={icon} />
        {label}
      </span>
      <AdminIcon name="chevronDown" />
    </>
  )
}
