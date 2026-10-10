import { Button } from '@reprint/ui'
import { type ReactNode, useId, useState } from 'react'
import { copy } from '../../copy/index.js'

/** Hides review text behind a "Show spoilers" button; the content is not rendered until opened. */
export function SpoilerToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#a8a29e] bg-[#fffbeb] px-4 py-3.5">
        <p className="inline-flex items-center gap-2.5 text-[15px]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[18px] shrink-0 text-warning"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <path d="m3 3 18 18" />
          </svg>
          {copy.reviews.spoilers.notice}
        </p>
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
      </div>
      <div id={contentId}>{open ? children : null}</div>
    </div>
  )
}
