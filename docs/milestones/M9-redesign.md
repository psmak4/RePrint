# M9 · Redesign

## Goal

Make RePrint more engaging and make it faster to learn about a Book, without turning it into a store. Switch the whole app to the light theme, rebuild the shell, Discover, the Book page, and search results to the redesign in `docs/DESIGN.md` (D-176), and add the two owner-approved data additions: review excerpts (D-177) and monthly review counts (D-179).

## PRD sections covered

§1 (discovery and reviews first), §7.2 (Discover rows), §7.3 (search results), §7.4 (Book page), §7.5 (Author, Genre, and Series data reused on the Book page), §7.7 (shelf controls), §11 (accessibility, performance targets, CSP, privacy), §12 (component, integration, e2e, and axe coverage). Changes beyond the PRD are recorded in D-176 to D-180.

## Deliverables

- The light palette replacing the dark one everywhere, with `ground-deep` and `star` tokens and contrast tests on all four grounds (D-176).
- Self-hosted Newsreader and Instrument Sans (D-180).
- The generated cover and the shared redesign components listed in `docs/DESIGN.md` (Component inventory, "Redesign (M9)").
- API: `justApproved` Discover row and `topReview` on Catalog search results (D-177); `recentReviewCount` on "Most reviewed this month" items (D-179). OpenAPI regenerated.
- Web: redesigned header and footer, Discover, Book page, and search results, at phone, tablet, and desktop widths.
- Updated component, integration, e2e, and axe tests.

## Acceptance criteria

1. Every page renders in the light theme and passes axe; no dark token values remain in `packages/ui/src/theme.css`.
2. Pages load the two fonts from RePrint's own origin only: no request goes to a Google domain, and the CSP is unchanged (`font-src 'self'`, `style-src 'self'`).
3. The web vitals check (M8-T08) still meets PRD §11 on the Book page: LCP ≤ 2.5 s and CLS ≤ 0.1 on the mobile profile.
4. Every Book without a Cover image shows a generated cover whose colour is stable for its slug.
5. Discover shows the hero search, featured review, genre tiles, Top rated, Most reviewed this month with "N new reviews", Just approved excerpts, and (visitors only) the sign-up pitch; hidden rows leave no gap.
6. The Book page shows the facts row, section nav, Details list, rating breakdown with filtering bars, series, author, and editions cards, and the More by Author and More in Genre rows.
7. Search results show the Author match card when the query matches an Author, and a review excerpt on Catalog Books that have an eligible review.
8. No excerpt ever comes from a spoiler review, an auto-hidden review, or a non-Approved review (integration tests prove each case).
9. No price, cart, or buy link appears anywhere (a copy-guard test checks the copy file).
10. axe passes on Discover, Book, and search pages at phone and desktop widths, and `pnpm check` and `pnpm test:e2e` pass.

## Implementation choices (recorded in `docs/DECISIONS.md`)

- D-176: visual direction and the light theme (replaces PRD §8's dark palette).
- D-177: excerpt rules and the shared `reviewExcerptSchema`.
- D-179: `recentReviewCount` on the monthly row.
- D-180: Fontsource packages, self-hosted, preload and fallback metrics.

## Out of scope

- A dark theme or theme switcher (dropped by the owner, D-176).
- Shelf counts on Books (withdrawn, D-178).
- Redesigning Author, Genre, Series, Library, Profile, settings, auth, and admin pages beyond what the new tokens and fonts change automatically.
- Personalized recommendations ("readers also liked"), which need data RePrint does not collect.
