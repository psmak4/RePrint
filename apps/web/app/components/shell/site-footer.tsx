import { copy } from '../../copy/index.js'
import { Wordmark } from './site-header.js'

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border bg-ground-deep">
      <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:justify-between md:py-12">
        <div className="flex max-w-[360px] flex-col gap-3">
          <Wordmark className="text-2xl" />
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.shell.tagline}</p>
          <p className="text-[13px] text-muted-foreground">
            {copy.shell.openLibraryCredit}{' '}
            <a href={copy.shell.openLibraryUrl} className="text-link underline" rel="noreferrer">
              {copy.shell.openLibraryName}
            </a>
          </p>
        </div>
        <nav aria-label={copy.shell.legalNavLabel}>
          <ul className="grid grid-cols-2 gap-x-7 gap-y-1 md:flex md:flex-wrap md:gap-y-3">
            {copy.shell.legalLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-block py-2 text-sm text-[#334155] hover:text-foreground hover:underline md:py-0"
                >
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
