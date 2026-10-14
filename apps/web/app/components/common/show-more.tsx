import { Button } from '@reprint/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * The one "Show more" (D-214): a centred outline pill under a list that grows in place. A link when
 * the next part comes from the server (`to`), a button when the page already has it (`onClick`).
 */
export function ShowMore({
  children,
  ...target
}: { children: ReactNode } & ({ to: string } | { onClick: () => void })) {
  return (
    <div className="flex justify-center">
      {'to' in target ? (
        <Button asChild variant="outline">
          <Link to={target.to}>{children}</Link>
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={target.onClick}>
          {children}
        </Button>
      )}
    </div>
  )
}
