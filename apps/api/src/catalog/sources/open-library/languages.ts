import type { Language } from '@reprint/shared'

/**
 * Open Library uses MARC language codes. Most equal ISO 639-2, but the common ones RePrint shows map to
 * ISO 639-1 so a Language means one thing everywhere. Codes not listed here that are three lowercase
 * letters pass through as ISO 639-2/3.
 */
const MARC_TO_ISO_639_1: Readonly<Record<string, string>> = {
  ara: 'ar',
  cat: 'ca',
  chi: 'zh',
  cze: 'cs',
  dan: 'da',
  dut: 'nl',
  eng: 'en',
  fin: 'fi',
  fre: 'fr',
  ger: 'de',
  gre: 'el',
  heb: 'he',
  hin: 'hi',
  hun: 'hu',
  ind: 'id',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  lat: 'la',
  nor: 'no',
  pol: 'pl',
  por: 'pt',
  rum: 'ro',
  rus: 'ru',
  spa: 'es',
  swe: 'sv',
  tur: 'tr',
  ukr: 'uk',
  vie: 'vi',
}

/** MARC codes that say "no language" rather than name one. */
const NOT_A_LANGUAGE = new Set(['und', 'zxx', 'mul', 'mis', 'xxx'])

/** The ISO 639 code for a MARC language code, or `null` when the code does not name a language. */
export function toLanguage(marc: string): Language | null {
  const code = marc.trim().toLowerCase()
  if (NOT_A_LANGUAGE.has(code)) return null
  const mapped = MARC_TO_ISO_639_1[code] ?? code
  return /^[a-z]{2,3}$/.test(mapped) ? mapped : null
}
