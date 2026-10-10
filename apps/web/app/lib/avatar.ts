// Whole-string classes so Tailwind emits them; inline styles are blocked by the CSP (D-185).
const AVATAR_CLASSES = [
  'bg-[#c7d2fe]',
  'bg-[#99f6e4]',
  'bg-[#fecdd3]',
  'bg-[#fde68a]',
  'bg-[#bfdbfe]',
  'bg-[#ddd6fe]',
  'bg-[#bbf7d0]',
  'bg-[#fed7aa]',
] as const

/** Up to two initials from a display name ("Maya R." gives "MR"). */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, '').charAt(0))
    .filter(Boolean)
  return (letters.slice(0, 2).join('') || '?').toUpperCase()
}

/** A pale background for an initials avatar, stable for the same key (FNV-1a over the key). */
export function avatarClass(key: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return AVATAR_CLASSES[hash % AVATAR_CLASSES.length] ?? AVATAR_CLASSES[0]
}

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

/** A review date as "Oct 9, 2026". UTC on both server and client, so hydration matches. */
export function shortDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}
