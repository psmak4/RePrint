# M11 · UI consistency

## Goal

Make every element look and behave the same on every page. A UI review on 2026-10-14 found that most controls are styled by hand in each page component rather than taken from one shared component, so they have drifted: the same kind of button has three text sizes, chips come in four heights, page titles in four sizes, and sorting, pagination, breadcrumbs, tabs, and menus work differently from page to page. The owner asked that nothing look or behave one way on one page and another way on another (D-214). This milestone builds the missing shared pieces, moves every page onto them, and adds a guard so hand-built copies cannot come back.

## PRD sections covered

§7.2 to §7.13 (every page), §8 (shadcn/ui components in `packages/ui`), §11 (WCAG 2.2 AA: keyboard use, focus, page titles), §12 (component and e2e tests).

## Baseline (2026-10-14, `f5d88d3`, measured at 1280 and 375 px on a copy of the owner's local data)

| Element | What varies |
| --- | --- |
| Page titles (`h1` outside Discover's hero and the Book header) | `PageHero` 38 → 56 px; admin 34 → 44; search 32 → 44; auth card 32 → 38. `DESIGN.md` says 32 → 44 in its type scale, 38 → 56 for Genres, and 34 → 44 for admin |
| Section headings (`h2`) | 24 px (settings), 26 (static pages), 32 (Book, Author, Series), 36 and 40 (Discover) |
| Pill buttons and links | About 20 hand-built in page components besides `Button`; at the same 44 px height, text is 14 px (`Button`, header), 15 px (Book actions, auth card, Library), or 16 px (Discover); the log in button is 48 px |
| Chips | 28 px / 13 px (child Genres), 30 / 13 (Series pill), 32 / 14 (format filter), 34 / 14 (Genre chips, star filters, "Try" chips, Genre sort) |
| Sort | Pill links that apply at once on the Genre page; a dropdown plus Apply on search, Library, and Book reviews; search's sort and filter forms reload the whole page while the others navigate in the app |
| Pagination | Previous and Next pills on Library, profile, Genre, and search (search builds its own copy); underlined text links on Book reviews |
| Breadcrumbs | A trail on the Book page and Genres; one "All genres" link on a Genre page; none on Author, Series, Library, profile, search, settings, or static pages |
| Header band and tabs | Search is the only browse page without the `ground-deep` band; tabs are built five times and sit inside the band on Settings and admin Genres but below it on Library, profile, and search; only Library and admin show counts |
| Menus | The phone menu, account menu, and notifications are `<details>` that stay open after a link is followed, ignore Escape and clicks outside, and can be open together; the account menu offers only Log out, so nothing links to Settings, the Member's profile, or admin |
| Cards and empty states | Card corners of 12, 14, 16, 18, 20, and 24 px; two dashed empty-state boxes (`#a8a29e` / 14 px and `#d9d4ca` / 18 px) |
| Colours | 176 raw hex colours (about 25 values) in class names beside the 17 theme tokens, including four greys for text and four for borders |
| Error page | No `<title>`, so the tab shows the URL |

## Deliverables

- Theme colours for every repeated value, and a style guard test that fails on raw colours and hand-built pills and chips.
- `Button` as the only pill action, with one text size per height; one `Chip`.
- One type scale for page titles, section headings, and card titles, and one card corner.
- One header band for every page but Discover, the Book page, and the auth card, each starting with a breadcrumb trail from Discover, with tabs at its bottom edge.
- One sort control, one way to submit filters, one pager, and one "Show more" button.
- Menus that close when they should, and an account menu that links to the Member's own pages.
- One empty state, and a title on error pages.
- `DESIGN.md` rewritten where it contradicts itself, and the measurements repeated.

## Acceptance criteria

1. Each element in the baseline table has one look and one behavior on every page where it appears, measured again at 1280 and 375 px by a script anyone can rerun.
2. The style guard fails on a raw hex colour or a hand-built pill or chip outside `@reprint/ui` and the documented exceptions.
3. Menus close on navigation, Escape, a click outside, and when another menu opens, with focus handled as `DESIGN.md` describes; component tests cover each case.
4. Changing a sort keeps focus on the control and the scroll position, and works without JavaScript through an Apply button.
5. `pnpm check` and the e2e and axe specs pass; no page scrolls sideways at 360 px.

## Out of scope

- New pages, features, or copy beyond the account menu's links and labels the shared components need.
- The Book header and Discover's hero layout (only their buttons, chips, and headings change).
- A theme switcher or dark palette (D-176).
