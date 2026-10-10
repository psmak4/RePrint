import { PageHero } from '../books/page-hero.js'

export interface StaticPageSection {
  heading: string
  paragraphs?: readonly string[]
  items?: readonly string[]
}

export interface StaticPageContent {
  title: string
  sections: readonly StaticPageSection[]
}

/** A legal or static page: a title and headed sections of plain copy (PRD §7.13). */
export function StaticPage({
  content,
  children,
}: {
  content: StaticPageContent
  children?: React.ReactNode
}) {
  return (
    <article className="flex flex-col gap-10 md:gap-12">
      <PageHero title={content.title} />
      <div className="flex w-full max-w-[680px] flex-col gap-10">
        {content.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl leading-tight font-medium md:text-[26px]">
              {section.heading}
            </h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="text-[17px] leading-[1.7] text-[#1e293b]">
                {paragraph}
              </p>
            ))}
            {section.items && (
              <ul className="list-disc space-y-2 pl-6 text-[17px] leading-[1.7] text-[#1e293b] marker:text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {children}
      </div>
    </article>
  )
}
