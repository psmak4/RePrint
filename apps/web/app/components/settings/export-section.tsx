import { copy } from '../../copy/index.js'

/** A plain link to the download route, so the browser saves the file the API sends. */
export function ExportSection() {
  const c = copy.settings.security.export
  return (
    <section aria-labelledby="export-heading">
      <h2 id="export-heading" className="text-xl font-semibold">
        {c.title}
      </h2>
      <p className="mt-1 text-muted-foreground">{c.lead}</p>
      <a
        href="/settings/export"
        download
        className="mt-4 inline-flex rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
      >
        {c.download}
      </a>
    </section>
  )
}
