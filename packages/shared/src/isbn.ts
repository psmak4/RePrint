/** Strips spaces and hyphens and uppercases, so `0-306-40615-2` and `080442957x` are comparable. */
function normalizeIsbn(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

/** True when the 10 characters are an ISBN-10 with a correct check digit (the last may be `X`). */
export function isValidIsbn10(input: string): boolean {
  const isbn = normalizeIsbn(input)
  if (!/^\d{9}[\dX]$/.test(isbn)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const char = isbn[i] as string
    sum += (char === 'X' ? 10 : Number(char)) * (10 - i)
  }
  return sum % 11 === 0
}

function isbn13CheckDigit(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

/** True when the 13 digits are an ISBN-13 (978/979 prefix) with a correct check digit. */
export function isValidIsbn13(input: string): boolean {
  const isbn = normalizeIsbn(input)
  if (!/^97[89]\d{10}$/.test(isbn)) return false
  return isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn[12])
}

/**
 * Converts an ISBN-10 to an ISBN-13, and passes a valid ISBN-13 through unchanged (hyphens and
 * spaces removed). Returns `null` for anything else, including a wrong check digit (PRD §5.1:
 * ISBN-10 is always converted to 13).
 */
export function toIsbn13(input: string): string | null {
  const isbn = normalizeIsbn(input)
  if (isValidIsbn13(isbn)) return isbn
  if (!isValidIsbn10(isbn)) return null
  const first12 = `978${isbn.slice(0, 9)}`
  return `${first12}${isbn13CheckDigit(first12)}`
}
