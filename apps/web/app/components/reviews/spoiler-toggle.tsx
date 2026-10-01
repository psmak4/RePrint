import { Button } from '@reprint/ui'
import { type ReactNode, useId, useState } from 'react'
import { copy } from '../../copy/index.js'

/** Hides review text behind a "Show spoilers" button; the content is not rendered until opened. */
export function SpoilerToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{copy.reviews.spoilers.notice}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? copy.reviews.spoilers.hide : copy.reviews.spoilers.show}
      </Button>
      <div id={contentId}>{open ? children : null}</div>
    </div>
  )
}
