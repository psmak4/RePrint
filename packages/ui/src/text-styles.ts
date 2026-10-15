/**
 * The heading roles of the type scale (DESIGN.md, D-214). Pages take their heading classes from
 * here, so a page title or a section title is the same size on every page.
 */
export const textStyles = {
  /** The `h1` of every page but Discover's hero, the Book header, and the auth card: 32 → 44 px. */
  pageTitle:
    'font-serif text-[32px] leading-[36px] font-medium tracking-[-0.02em] break-words md:text-[44px] md:leading-[48px]',
  /** A page section's `h2`: 26 → 32 px. */
  sectionTitle:
    'font-serif text-[26px] leading-[30px] font-medium tracking-[-0.01em] md:text-[32px] md:leading-[36px]',
  /** The title of a card or panel: 21 → 22 px. */
  cardTitle: 'font-serif text-[21px] leading-[26px] font-medium md:text-[22px] md:leading-[28px]',
  /** A small uppercase label above a heading or a group: 12 → 13 px. The page adds its colour. */
  eyebrow: 'text-xs font-semibold tracking-[0.12em] uppercase md:text-[13px]',
} as const
