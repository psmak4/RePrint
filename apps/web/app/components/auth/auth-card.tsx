import type { ReactNode } from 'react'

/**
 * The centered card every account page uses (log in, register, recovery, verification): a serif
 * title, an optional lead, the body, and links under the card.
 */
export function AuthCard({
  title,
  lead,
  children,
  footer,
  live = false,
}: {
  title: string
  lead?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** Announce the card's content when it replaces a form (a "check your email" state). */
  live?: boolean
}) {
  return (
    <section
      aria-live={live ? 'polite' : undefined}
      className="mx-auto flex w-full max-w-[460px] flex-col items-center gap-6 py-4 md:py-10"
    >
      <div className="w-full rounded-3xl border border-border bg-surface p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.35)] md:p-10">
        <h1 className="font-serif text-[32px] leading-[1.1] font-medium tracking-[-0.01em] md:text-[38px]">
          {title}
        </h1>
        {lead ? (
          <div className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{lead}</div>
        ) : null}
        {children}
      </div>
      {footer ? (
        <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </section>
  )
}

/** A full-width pill link for the one next step on a result card. */
export function AuthNextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-foreground hover:bg-accent-hover"
    >
      {children}
    </a>
  )
}
