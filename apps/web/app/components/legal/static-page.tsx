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
    <article className="mx-auto max-w-2xl py-8">
      <h1 className="text-3xl font-semibold">{content.title}</h1>
      {content.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mt-3 leading-relaxed">
              {paragraph}
            </p>
          ))}
          {section.items && (
            <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {children}
    </article>
  )
}
