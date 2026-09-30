import type {
  AuthorRecord,
  BookCandidate,
  BookCandidateEdition,
  ContributionRole,
  Format,
} from '@reprint/shared'

/** The name stored in `source_links.source` for generated sample data. */
export const SEED_SOURCE = 'seed'

/** Where the generated Books total (the fixture Book makes it 500). */
export const GENERATED_BOOK_COUNT = 499

/** A small seeded random source; `createSeedRandom` from `@reprint/db` fits this shape. */
export interface Random {
  next: () => number
  int: (min: number, max: number) => number
  pick: <T>(items: readonly [T, ...T[]]) => T
}

export interface SeedBook {
  candidate: BookCandidate
  authorRecords: Map<string, AuthorRecord>
}

const FIRST_NAMES = [
  'Ada',
  'Bruno',
  'Celia',
  'Dmitri',
  'Elena',
  'Farid',
  'Greta',
  'Hiro',
  'Ingrid',
  'Jonas',
  'Keiko',
  'Lucas',
  'Marisol',
  'Nadia',
  'Oskar',
  'Priya',
  'Quinn',
  'Rosa',
  'Soren',
  'Tamsin',
  'Umar',
  'Vera',
  'Wendell',
  'Ximena',
  'Yusuf',
  'Zora',
] as const
const LAST_NAMES = [
  'Achebe',
  'Baptiste',
  'Castellan',
  'Drummond',
  'Eriksen',
  'Fairweather',
  'Gallagher',
  'Halvorsen',
  'Ibarra',
  'Jankowski',
  'Kowalczyk',
  'Lindqvist',
  'Marchetti',
  'Nakagawa',
  'Okonkwo',
  'Petrov',
  'Quintero',
  'Rasmussen',
  'Sandoval',
  'Thackeray',
  'Underhill',
  'Vasquez',
  'Whitlock',
  'Yamamoto',
] as const
const ADJECTIVES = [
  'Silent',
  'Golden',
  'Broken',
  'Hidden',
  'Last',
  'Burning',
  'Paper',
  'Winter',
  'Distant',
  'Hollow',
  'Crimson',
  'Quiet',
  'Restless',
  'Borrowed',
  'Salt',
  'Iron',
  'Forgotten',
  'Midnight',
  'Wandering',
  'Bright',
] as const
const NOUNS = [
  'Harbor',
  'Orchard',
  'Lantern',
  'Archive',
  'Garden',
  'Compass',
  'Cathedral',
  'River',
  'Signal',
  'Meridian',
  'Almanac',
  'Cartographer',
  'Lighthouse',
  'Tide',
  'Ledger',
  'Kingdom',
  'Empire',
  'Season',
  'Letter',
  'Orbit',
] as const
const PLACES = [
  'Lisbon',
  'Kyoto',
  'the North',
  'Oaxaca',
  'the Long Water',
  'Tallinn',
  'Marrakesh',
  'Ashford',
  'the Deep',
  'Reykjavik',
] as const
const SUBTITLES = [
  'A Novel',
  'A Field Guide',
  'Stories',
  'An Unlikely History',
  'A Memoir',
  'Essays on Time',
  'The Complete Collection',
] as const
const PUBLISHERS = [
  'Harbor & Vine',
  'Northlight Press',
  'Meridian House',
  'Copper Kettle Books',
  'Salt Marsh Editions',
  'Lantern Row',
] as const
const OTHER_LANGUAGES = ['fr', 'de', 'es', 'it', 'ja', 'pt'] as const

/**
 * Subject labels per Genre profile. Each label is written the way a Source tags Books, so the starter
 * Subject-to-Genre rules (D-047) map it; the profile order covers all 42 Genres.
 */
const PROFILES: readonly (readonly [string, ...string[]])[] = [
  ['Literary fiction', 'Psychological fiction'],
  ['Contemporary fiction', 'Domestic fiction'],
  ['Historical fiction', 'War stories'],
  ['Classic literature', 'Classics'],
  ['Science fiction', 'Space opera'],
  ['Dystopian fiction', 'Dystopia'],
  ['Fantasy fiction', 'Magic'],
  ['Horror', 'Ghost stories'],
  ['Mystery', 'Private investigators'],
  ['Thriller', 'Espionage'],
  ['Crime fiction', 'Noir'],
  ['Romance', 'Love stories'],
  ['Adventure stories', 'Sea stories'],
  ['Western stories', 'Frontier and pioneer life'],
  ['Humorous fiction', 'Satire'],
  ['Short stories', 'American fiction'],
  ['Poetry', 'Poems'],
  ['Drama', 'Plays'],
  ['Graphic novels', 'Comics'],
  ['Mythology', 'Folklore'],
  ['Young adult fiction', 'Teen'],
  ['Middle grade fiction', 'Friendship'],
  ['Juvenile fiction', 'Picture books'],
  ['Biography', 'Autobiography'],
  ['Memoir', 'Family relationships'],
  ['History', 'Social conditions'],
  ['True crime', 'Criminal investigation'],
  ['Popular science', 'Astronomy'],
  ['Technology', 'Computer science'],
  ['Philosophy', 'Ethics'],
  ['Psychology', 'Cognition'],
  ['Religion', 'Spirituality'],
  ['Political science', 'Sociology'],
  ['Economics', 'Management'],
  ['Self-help', 'Self-actualization'],
  ['Nutrition', 'Fitness'],
  ['Cookbooks', 'Cooking'],
  ['Description and travel', 'Voyages and travels'],
  ['Photography', 'Art'],
  ['Musicians', 'Music'],
  ['Outdoor recreation', 'Sports'],
  ['Essays', 'Nature'],
]

/** ISBN-13 with a correct check digit, from a running counter so every one is unique. */
export function seedIsbn13(counter: number): string {
  const body = `9781${String(counter).padStart(8, '0')}`
  let sum = 0
  for (const [i, digit] of [...body].entries()) sum += Number(digit) * (i % 2 === 0 ? 1 : 3)
  return `${body}${(10 - (sum % 10)) % 10}`
}

function authorLink(sourceId: string) {
  return { source: SEED_SOURCE, entityType: 'author', sourceId } as const
}

function buildAuthors(random: Random, count: number): AuthorRecord[] {
  const combos = FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => `${first} ${last}`))
  const records: AuthorRecord[] = []
  for (let i = 0; i < count; i++) {
    // Walk the combinations with a stride coprime to their number, so names repeat only after all are used.
    const name = combos[(i * 7) % combos.length] as string
    const sourceId = `seed-author-${i + 1}`
    const born = random.int(1880, 1995)
    const roll = random.next()
    records.push({
      // A few Authors keep a pen-name-style alternate; `roll` also decides which records lack data.
      name,
      alternateNames: roll < 0.2 ? [`${name.split(' ')[0]?.[0]}. ${name.split(' ')[1]}`] : [],
      bio:
        roll < 0.75
          ? `${name} writes about ${random.pick(NOUNS).toLowerCase()}s and the people near them.`
          : null,
      birthDate: roll < 0.85 ? `${born}-${String(random.int(1, 12)).padStart(2, '0')}-15` : null,
      deathDate: roll < 0.85 && born < 1935 ? `${born + random.int(45, 85)}-06-01` : null,
      photo: null,
      sourceLink: authorLink(sourceId),
    })
  }
  return records
}

interface SeriesPlan {
  name: string
  authorIndex: number
  profile: number
}

const FORMATS_BY_SLOT: readonly Format[] = ['paperback', 'hardcover', 'ebook', 'audiobook']

/**
 * Deterministic sample Catalog data in RePrint vocabulary: `GENERATED_BOOK_COUNT` Books over about 120
 * Authors, 45 Series, all 42 Genre profiles, several Editions each, translations, audiobooks with
 * narrators, and missing-data cases (no description, no year, no date, no page count, no ISBN, no
 * Author record, no Series position). Three Books repeat another Book's title and Author under a
 * different Source ID so the merge queue has entries. The same `random` sequence gives the same output.
 */
export function generateSeedBooks(
  random: Random,
  count: number = GENERATED_BOOK_COUNT,
): SeedBook[] {
  const authorRecords = buildAuthors(random, 120)
  const seriesPlans: SeriesPlan[] = Array.from({ length: 45 }, (_, i) => ({
    name: `The ${random.pick(ADJECTIVES)} ${random.pick(NOUNS)} ${['Cycle', 'Trilogy', 'Chronicles', 'Sequence'][i % 4]}`,
    authorIndex: random.int(0, authorRecords.length - 1),
    profile: i % PROFILES.length,
  }))

  const usedTitles = new Set<string>()
  const uniqueTitle = (make: () => string): string => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const title = make()
      if (!usedTitles.has(title)) {
        usedTitles.add(title)
        return title
      }
    }
    const fallback = `${make()} ${usedTitles.size}`
    usedTitles.add(fallback)
    return fallback
  }
  const makeTitle = () =>
    random.pick([
      () => `The ${random.pick(ADJECTIVES)} ${random.pick(NOUNS)}`,
      () => `${random.pick(NOUNS)} of ${random.pick(PLACES)}`,
      () => `${random.pick(ADJECTIVES)} ${random.pick(NOUNS)}s`,
      () => `A ${random.pick(NOUNS)} for ${random.pick(PLACES)}`,
      () => `${random.pick(PLACES)} and the ${random.pick(NOUNS)}`,
    ] as const)()

  let isbnCounter = 1
  const books: SeedBook[] = []

  const build = (
    index: number,
    forced?: { title: string; authorIndex: number; profile: number },
  ) => {
    const number = index + 1
    const inSeries =
      !forced && index < 170 ? seriesPlans[Math.floor(index / 4) % seriesPlans.length] : undefined
    const authorIndex =
      forced?.authorIndex ?? inSeries?.authorIndex ?? random.int(0, authorRecords.length - 1)
    const profile = forced?.profile ?? inSeries?.profile ?? index % PROFILES.length
    const author = authorRecords[authorIndex] as AuthorRecord
    const title = forced?.title ?? uniqueTitle(makeTitle)
    const translated = random.next() < 0.1
    const originalLanguage = translated ? random.pick(OTHER_LANGUAGES) : 'en'
    const roll = random.next()

    const contributions: BookCandidate['book']['contributions'] = [
      { authorName: author.name, role: 'author', position: 0, sourceLink: author.sourceLink },
    ]
    const extra = (role: ContributionRole, position: number | null, authorIdx: number) => {
      const other = authorRecords[authorIdx % authorRecords.length] as AuthorRecord
      if (other.name === author.name) return
      contributions.push({ authorName: other.name, role, position, sourceLink: other.sourceLink })
    }
    if (random.next() < 0.12) extra('co_author', 1, authorIndex + 3)
    if (translated) extra('translator', 2, authorIndex + 5)
    if (random.next() < 0.08) extra('illustrator', 3, authorIndex + 9)
    if (random.next() < 0.05) extra('editor', null, authorIndex + 11)

    const editionCount = random.int(1, 5)
    const editionList: BookCandidateEdition[] = []
    for (let slot = 0; slot < editionCount; slot++) {
      const format = slot === 0 && roll > 0.97 ? 'unknown' : (FORMATS_BY_SLOT[slot % 4] as Format)
      const isTranslation = translated && slot === editionCount - 1 && editionCount > 1
      const year = random.int(1950, 2025)
      editionList.push({
        isbn13: roll > 0.97 && slot === 0 ? null : seedIsbn13(isbnCounter++),
        format,
        language: isTranslation ? 'en' : originalLanguage,
        title: null,
        publisherName: random.next() < 0.9 ? random.pick(PUBLISHERS) : null,
        publishedDate:
          random.next() < 0.9
            ? `${year}-${String(random.int(1, 12)).padStart(2, '0')}-${String(random.int(1, 28)).padStart(2, '0')}`
            : null,
        pageCount: format === 'audiobook' || random.next() < 0.08 ? null : random.int(96, 820),
        cover: null,
        sourceLink: {
          source: SEED_SOURCE,
          entityType: 'edition',
          sourceId: `seed-edition-${number}-${slot + 1}`,
        },
      })
    }
    if (editionList.some((edition) => edition.format === 'audiobook'))
      extra('narrator', null, authorIndex + 13)

    const labels = [...(PROFILES[profile] as readonly string[])]
    if (random.next() < 0.5)
      labels.push(random.pick(['Prize winners', 'Bestsellers', 'Book club favorites'] as const))
    books.push({
      // One Book in twenty has no Author record, only the name on the byline.
      authorRecords:
        random.next() < 0.05
          ? new Map()
          : new Map(
              contributions.flatMap((c) => {
                const record = authorRecords.find(
                  (r) => r.sourceLink.sourceId === c.sourceLink?.sourceId,
                )
                return record ? [[record.sourceLink.sourceId, record] as const] : []
              }),
            ),
      candidate: {
        book: {
          title,
          subtitle: random.next() < 0.15 ? random.pick(SUBTITLES) : null,
          description:
            roll < 0.15
              ? null
              : `${title} follows ${author.name}'s ${random.pick(ADJECTIVES).toLowerCase()} account of ${random.pick(NOUNS).toLowerCase()}s, ${random.pick(PLACES)}, and what people leave behind.\n\nSample text for local development.`,
          firstPublishedYear: roll > 0.92 ? null : random.int(1850, 2024),
          originalLanguage: roll > 0.99 ? null : originalLanguage,
          cover: null,
          contributions,
          series: inSeries
            ? [
                {
                  name: inSeries.name,
                  position: index % 4 === 3 ? null : (index % 4) + (index % 11 === 0 ? 0.5 : 1),
                },
              ]
            : [],
          subjects: labels.map((label) => ({ label })),
        },
        editions: editionList,
        sourceLink: { source: SEED_SOURCE, entityType: 'book', sourceId: `seed-book-${number}` },
        confidence: 1,
      },
    })
  }

  const plain = count - 3
  for (let index = 0; index < plain; index++) build(index)
  // Look-alikes: the same title and Author under another Source ID, for the merge queue (PRD §5.4).
  for (const [offset, sourceIndex] of [200, 250, 300].entries()) {
    const original = books[sourceIndex]
    const author = original?.candidate.book.contributions[0]
    if (!original || !author) continue
    const record = authorRecords.find((r) => r.sourceLink.sourceId === author.sourceLink?.sourceId)
    build(plain + offset, {
      title: original.candidate.book.title,
      authorIndex: record ? authorRecords.indexOf(record) : 0,
      profile: (sourceIndex + 1) % PROFILES.length,
    })
  }
  return books
}
