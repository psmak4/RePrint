// Copy for the legal and static pages (PRD §7.13). Its own module so only those pages load it (M10-T07).
export const legalCopy = {
  // The owner's monitored inbox (M8-T17).
  contactEmail: 'psmak4@gmail.com',
  terms: {
    title: 'Terms of Service',
    description: 'The rules for using RePrint: accounts, reviews, and acceptable use.',
    sections: [
      {
        heading: 'Using RePrint',
        paragraphs: [
          'RePrint is a place to discover books and read and write reviews. By creating an account or using the site you agree to these terms.',
          'You must give a real email address, keep your password private, and tell us if you think someone else has used your account.',
        ],
      },
      {
        heading: 'Your reviews',
        paragraphs: [
          'You keep ownership of what you write. By submitting a review you give RePrint a licence to show it on the site and in search results.',
          'Every review is read by a moderator before it is published. We may reject a review that breaks the Community Guidelines, and we may unpublish an approved review that does.',
          'You may write one review per Book. Editing a published review sends it back for approval.',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'Do not use RePrint to harass others, post spam, scrape the site at a rate that harms it, or try to get around its security.',
          'We may suspend an account that breaks these terms.',
        ],
      },
      {
        heading: 'Changes and deletion',
        paragraphs: [
          'You can delete your account at any time from Settings. We may update these terms and will say so on this page.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    description: 'What RePrint collects, how long it is kept, and your rights under GDPR and CCPA.',
    sections: [
      {
        heading: 'What we collect',
        paragraphs: [
          'Your email address, username, display name, password (stored only as a hash), profile details you choose to add, your reviews, ratings, Helpful votes, reports, and your Library.',
          'We also keep the IP address of each session and of each action taken by a moderator or admin.',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'IP addresses in sessions and the audit log are cleared after 90 days.',
          'When you delete your account it is disabled at once and permanently erased after 30 days, along with your reviews, votes, reports, and Library.',
        ],
      },
      {
        heading: 'Cookies and analytics',
        paragraphs: [
          'RePrint uses one session cookie to keep you logged in. Our analytics is cookieless: it sets no cookies and does not track you across sites, so there is no cookie banner.',
        ],
      },
      {
        heading: 'Your rights under GDPR and CCPA',
        paragraphs: [
          'If you live in the European Economic Area, the United Kingdom, or California, you have the right to access your data, correct it, delete it, receive a portable copy, object to or restrict how it is used, and to not be discriminated against for using these rights. We do not sell personal information.',
          'You can download a JSON export of your data and delete your account from Settings. For anything else, write to us using the Contact page.',
        ],
      },
      {
        heading: 'Who else sees your data',
        paragraphs: [
          'We use service providers to host the site, send email, and report errors. They handle data only on our behalf. Book data and covers come from Open Library; we do not send them your personal information.',
        ],
      },
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    description: 'What gets a review rejected, so you can write reviews that are approved.',
    sections: [
      {
        heading: 'Why we moderate',
        paragraphs: [
          'Every review is read by a moderator before it is published, so readers can trust what they see. A rejected review stays visible only to you, with the reason if the moderator gave one. You can edit it and send it again.',
        ],
      },
      {
        heading: 'A review may be rejected for',
        items: [
          'An unmarked spoiler. Tick “Contains spoilers” if your review gives away the plot.',
          'Offensive or hateful content, including attacks on people for who they are.',
          'Spam or advertising, including links and promotion of your own products or services.',
          'Being off-topic: the review is not about the Book.',
          'Other reasons the moderator explains in a note.',
        ],
      },
      {
        heading: 'Writing a good review',
        paragraphs: [
          'Say what you thought and why. Reviews are plain text between 50 and 10,000 characters; links are shown as text and are not clickable. You can review each Book once.',
        ],
      },
      {
        heading: 'Reporting a review',
        paragraphs: [
          'If a published review breaks these guidelines, use Report on the review. A moderator will look at it and may unpublish it.',
        ],
      },
    ],
  },
  about: {
    title: 'About RePrint',
    description:
      'RePrint is a place to discover books and read reviews you can trust, each approved by a moderator.',
    sections: [
      {
        heading: 'Discovery and trust first',
        paragraphs: [
          'RePrint helps you find your next book and read reviews you can trust. Every review is approved by a moderator before it is published, every reviewer has a verified account, and each Member can review a Book once.',
          'Your Library, with Shelves for Want to read, Reading, and Read, gives you a place to keep track of what you want to read and what you have finished.',
        ],
      },
      {
        heading: 'Where the data comes from',
        paragraphs: [
          'Book information and covers come from Open Library and are kept in RePrint’s own Catalog. Reviews, ratings, and Libraries belong to RePrint and its Members.',
        ],
      },
    ],
  },
  contact: {
    title: 'Contact',
    description: 'How to reach the RePrint team about your account, a review, or privacy.',
    sections: [
      {
        heading: 'Get in touch',
        paragraphs: [
          'For questions about your account, a rejected or unpublished review, a privacy request, or a mistake in the Catalog, write to us.',
        ],
      },
      {
        heading: 'Reporting a review',
        paragraphs: [
          'To report a published review, use Report on the review itself so a moderator sees it right away.',
        ],
      },
    ],
    emailLabel: 'Email',
  },
} as const
