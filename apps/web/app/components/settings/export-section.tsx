import { copy } from '../../copy/index.js'

/** A plain link to the download route, so the browser saves the file the API sends. */
export function ExportSection() {
  const c = copy.settings.security.export
  return (
    <section
      aria-labelledby="export-heading"
      className="rounded-2xl border border-border bg-surface p-6 md:p-8"
    >
      <h2 id="export-heading" className="font-serif text-2xl leading-tight font-medium">
        {c.title}
      </h2>
      <p className="mt-2 text-[15px] text-muted-foreground">{c.lead}</p>
      <a
        href="/settings/export"
        download
        className="mt-5 inline-flex h-11 items-center rounded-full border border-input-border bg-surface px-5 text-[15px] font-semibold hover:bg-surface-raised"
      >
        {c.download}
      </a>
    </section>
  )
}
