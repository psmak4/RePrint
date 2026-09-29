import { copy } from '../../copy/index.js'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>
          {copy.shell.openLibraryCredit}{' '}
          <a href={copy.shell.openLibraryUrl} className="text-link underline" rel="noreferrer">
            {copy.shell.openLibraryName}
          </a>
        </p>
        <nav aria-label={copy.shell.legalNavLabel}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {copy.shell.legalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-link underline">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
