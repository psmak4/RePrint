export const copy = {
  shell: {
    brand: 'RePrint',
    skipToContent: 'Skip to main content',
    homeLinkLabel: 'RePrint home',
    searchLabel: 'Search',
    accountLabel: 'Account',
    legalNavLabel: 'Legal and help',
    openLibraryCredit: 'Book data and covers courtesy of',
    openLibraryName: 'Open Library',
    openLibraryUrl: 'https://openlibrary.org',
    legalLinks: [
      { label: 'About', href: '/about' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Community Guidelines', href: '/community-guidelines' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  home: {
    title: 'Discover books. Read reviews you can trust.',
    lead: 'Every review on RePrint is approved by a moderator before anyone sees it.',
    cta: 'Browse books',
  },
  error: {
    title: 'Something went wrong',
    notFoundTitle: 'Page not found',
    body: 'We could not load this page. Please try again in a moment.',
    notFoundBody: 'The page you are looking for does not exist.',
    home: 'Back to home',
  },
} as const
