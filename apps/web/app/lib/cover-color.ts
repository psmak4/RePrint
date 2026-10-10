/** Background colours for generated covers (docs/DESIGN.md, Generated covers). */
export const GENERATED_COVER_COLORS = [
  '#1e3a8a',
  '#312e81',
  '#155e75',
  '#134e4a',
  '#14532d',
  '#3f6212',
  '#713f12',
  '#7c2d12',
  '#9a3412',
  '#831843',
  '#4c1d95',
  '#57534e',
] as const

/** The colour a generated cover gets: a stable pick from the list by hashing the slug (FNV-1a). */
export function generatedCoverColor(slug: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return GENERATED_COVER_COLORS[hash % GENERATED_COVER_COLORS.length] ?? GENERATED_COVER_COLORS[0]
}

// Whole-string classes so Tailwind emits them; inline styles are blocked by the CSP.
const GENERATED_COVER_CLASSES = [
  'bg-[#1e3a8a]',
  'bg-[#312e81]',
  'bg-[#155e75]',
  'bg-[#134e4a]',
  'bg-[#14532d]',
  'bg-[#3f6212]',
  'bg-[#713f12]',
  'bg-[#7c2d12]',
  'bg-[#9a3412]',
  'bg-[#831843]',
  'bg-[#4c1d95]',
  'bg-[#57534e]',
] as const

/** The background class for `generatedCoverColor(slug)`. */
export function generatedCoverClass(slug: string): string {
  const index = (GENERATED_COVER_COLORS as readonly string[]).indexOf(generatedCoverColor(slug))
  return GENERATED_COVER_CLASSES[index] ?? GENERATED_COVER_CLASSES[0]
}
