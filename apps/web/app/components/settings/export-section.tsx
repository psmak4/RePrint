import { buttonVariants, cn, textStyles } from '@reprint/ui'
import { settingsCopy } from '../../copy/settings.js'

/** A plain link to the download route, so the browser saves the file the API sends. */
export function ExportSection() {
  const c = settingsCopy.security.export
  return (
    <section
      aria-labelledby="export-heading"
      className="rounded-2xl border border-border bg-surface p-6 md:p-8"
    >
      <h2 id="export-heading" className={textStyles.cardTitle}>
        {c.title}
      </h2>
      <p className="mt-2 text-[15px] text-muted-foreground">{c.lead}</p>
      <a
        href="/settings/export"
        download
        className={cn(buttonVariants({ variant: 'outline' }), 'mt-5')}
      >
        {c.download}
      </a>
    </section>
  )
}
