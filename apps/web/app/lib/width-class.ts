// Tailwind only emits classes it finds as whole strings, and the CSP (`style-src 'self'`) blocks
// inline `style` attributes, so widths come from this fixed list instead of `style={{ width }}`.
const WIDTH_CLASSES = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const

/** A width class for a 0 to 1 fraction, rounded to the nearest 5%. */
export function widthClass(fraction: number): string {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  return WIDTH_CLASSES[Math.round(clamped * 20)] ?? 'w-0'
}
