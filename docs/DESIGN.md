# RePrint design system

Source of truth for UI work (PRD §8, §11). Tokens live in `packages/ui/src/theme.css`; strings live in `apps/web/app/copy/`. Light theme only (D-176 replaces the earlier dark-only palette; there is no theme switcher).

This document describes the redesign (D-176), built in milestone M9. Until an M9 task lands, the code for that area still follows the previous spec in git history; the reference mockups are on the owner's design canvas "RePrint Redesign".

## Principles

- Reading and reviews come first: content on a calm, warm light surface, one accent colour for actions.
- Books lead with their covers. Every Book shows a cover: the real one, or a designed generated cover.
- Show what readers said, not only scores: review excerpts appear on Discover and in search results (D-177).
- Information is one glance or one jump away: key facts sit beside the cover, and long pages have a section nav.
- Not a store: no prices, carts, "buy" links, or retailer branding anywhere.
- Server-rendered first paint; no layout shift (reserve cover and image space with `aspect-ratio`).
- WCAG 2.2 AA everywhere (PRD §11). Every interactive element is keyboard-operable with a visible focus ring.

## Layout grid and breakpoints

| Name | Min width | Use |
| --- | --- | --- |
| (base) | 360 px | Smallest supported. Single column, 16 px gutters |
| `sm` | 640 px | 24 px gutters; two-up card grids |
| `md` | 768 px | Header search shares the row with the logo; sidebars may appear |
| `lg` | 1024 px | 12-column grid; two-column page templates |
| `xl` | 1280 px | Wider card grids; the container stops growing |

- Page container: `max-w-page` (72 rem, 1152 px), centred, `px-4 sm:px-6`.
- 12-column CSS grid from `lg`, 24 px gap. Main content spans 8 columns and a side panel 4 where a template has one. Below `lg` everything stacks.
- No horizontal scrolling at 360 px, except inside tables (see Admin table pattern).

## Type scale

Two typefaces (D-180), self-hosted from the Google Fonts files via Fontsource, Latin subset, preloaded, `font-display: swap`, with metric-adjusted fallbacks:

- `--font-serif`: Newsreader (variable). Titles, section headings, review headlines, Book descriptions, and review excerpts.
- `--font-sans`: Instrument Sans (variable). Everything else: UI, labels, meta, body text of reviews.

| Role | Font | Size / line height (base → `md`) | Weight |
| --- | --- | --- | --- |
| Hero title (Discover h1) | serif | 40/42 → 64/66, tracking −0.02em | 500 |
| Book title (Book page h1) | serif | 38/40 → 60/62, tracking −0.02em | 500 |
| Page title (other h1) | serif | 32/36 → 44/48 | 500 |
| Section title (h2) | serif | 26/30 → 32/36 (Discover rows 36/40) | 500 |
| Card or panel title (h3) | serif | 21/26 → 22/28 | 500 |
| Review headline | serif | 21/26 → 24/30 | 500 |
| Book title on a card | serif | 16/20 → 18/22 | 500 |
| Long text (description) | serif | 18/29 → 19/31 | 400 |
| Body | sans | 16/24 (review bodies 16/27) | 400 |
| Lead | sans | 16/25 → 19/29 | 400 |
| Secondary, meta | sans `text-muted-foreground` | 14/20 | 400 |
| Eyebrow label | sans, uppercase, tracking 0.12em | 12/16 → 13/16 | 600 |

One `h1` per page; do not skip heading levels. Body text never goes below 14 px; only eyebrow labels and badge counts use 12 or 13 px.

## Spacing scale

Tailwind's 4 px scale, using only: 1 (4), 2 (8), 3 (12), 4 (16), 6 (24), 8 (32), 12 (48), 16 (64). Inside a component use 2 to 4; between components 6 or 8; between page sections 12. Touch targets are at least 44 × 44 px on mobile (`h-11`), 24 × 24 px at minimum anywhere (WCAG 2.5.8).

## Colour tokens

Exposed as Tailwind v4 theme variables (`bg-background`, `text-muted-foreground`, and so on) from `@reprint/ui/theme.css`.

| Token | Value | Use |
| --- | --- | --- |
| `background` | `#fbfaf7` | Page background (warm off-white) |
| `ground-deep` | `#f3efe8` | Hero bands (Discover hero, Book header) and the footer |
| `surface` | `#ffffff` | Header, cards, inputs, menus |
| `surface-raised` | `#f3f1ec` | Hover state, selected rows, inset panels |
| `foreground` | `#0f172a` | Body text and headings |
| `muted-foreground` | `#475569` | Secondary text |
| `border` | `#e4e0d8` | Decorative dividers and card edges only |
| `input-border` | `#7a7f88` | Input and outline-button boundaries |
| `accent` | `#2563eb` | Primary buttons, selected state, focus ring (`ring`) |
| `accent-foreground` | `#ffffff` | Text on `accent` and `accent-hover` |
| `accent-hover` | `#1d4ed8` | Hover state of primary buttons (a solid colour: a translucent `accent` over a light ground fails contrast) |
| `link` | `#1d4ed8` | Text links (underlined in running text) |
| `danger` / `success` / `warning` | `#b91c1c` / `#166534` / `#a8500a` | Status text and icons; never colour alone, always with text or an icon |
| `star` | `#a8500a` (same value as `warning`) | Filled stars and rating bars only. Empty stars and bar tracks use `#d6d3d1` / `#ece8e0` (decorative: a rating always shows its number too) |

`color-scheme: light`. Shadows are soft and navy-tinted (`rgba(15, 23, 42, …)`), used on raised cards, menus, and covers.

### Contrast (WCAG AA), enforced by `packages/ui/src/theme.test.ts`

Every pair is checked on all four grounds: background / surface / surface-raised / ground-deep.

| Pair | Ratio | Rule |
| --- | --- | --- |
| foreground | 17.1 / 17.9 / 15.8 / 15.6 | Text 4.5:1 |
| muted-foreground | 7.3 / 7.6 / 6.7 / 6.6 | Text 4.5:1 |
| link | 6.4 / 6.7 / 5.9 / 5.9 | Text 4.5:1 |
| danger | 6.2 / 6.5 / 5.7 / 5.7 | Text 4.5:1 |
| success | 6.8 / 7.1 / 6.3 / 6.2 | Text 4.5:1 |
| warning and star | 5.3 / 5.5 / 4.9 / 4.8 | Text 4.5:1 (so amber labels are safe too) |
| accent (focus ring) | 5.0 / 5.2 / 4.6 / 4.5 | UI 3:1 |
| input-border | 3.9 / 4.0 / 3.6 / 3.5 | UI 3:1 |
| accent-foreground on accent / accent-hover | 5.2 / 6.7 | Text 4.5:1 |

Amber (`star`) only ever means a rating or a featured label; it is never an action colour. Body copy that needs more weight than `muted-foreground` uses `#334155` (9.9:1 on background).

### Generated covers

A Book with no Cover image gets a generated cover: a solid colour chosen by hashing the slug into this list, `#1e3a8a #312e81 #155e75 #134e4a #14532d #3f6212 #713f12 #7c2d12 #9a3412 #831843 #4c1d95 #57534e`, with a 1 px inset frame at 32% opacity, the author in small uppercase at the top, the title in the serif in the middle, and a short rule below. Text is `#fdfaf3` (at least 6.5:1 on every colour; the author line at 88% opacity stays above 4.5:1). Sizes scale with the cover through container query units, so one component serves 44 px thumbnails and the 300 px Book header.

## Component inventory

Components come from shadcn/ui, copied into `packages/ui/src/components/`, restyled with the tokens above. App-specific components live in `apps/web/app/components/`.

| Need | Component | Status |
| --- | --- | --- |
| Buttons | shadcn `Button` (default, secondary, outline, ghost; sm, default, lg) | Built (M1-T11) |
| Form fields | shadcn `Input`, `Textarea`, `Label`, `Checkbox`, `RadioGroup`, `Select`, `Form` (React Hook Form) | `Input`, `Label` built (M2-T10); `Textarea`, `Checkbox` built (M2-T19); `AuthForm` in `apps/web/app/components/auth/`; rest as needed |
| Feedback | shadcn `Alert`, `Sonner` toast, `Badge` (status: pending, approved, rejected, unpublished) | Add as needed |
| Overlays | shadcn `Dialog`, `AlertDialog` (confirm deletes), `DropdownMenu` (account, bell), `Popover`, `Tooltip` | Add as needed |
| Navigation | shadcn `Tabs` (search Books/Authors), `Pagination`, `Breadcrumb` | Add as needed |
| Data | shadcn `Table`, `Skeleton`, `Separator`, `Avatar` | Add as needed |
| Combobox | `SearchBox` in `apps/web/app/components/shell/`: hand-built ARIA combobox for header search suggestions (D-108) | Built (M3-T16) |
| App shell | `AppShell`, `SiteHeader` (logo, search slot, account slot), `SiteFooter` (Open Library credit, legal links), skip link | Built (M1-T12) |
| Books | `Cover` (2:3, generated fallback), `BookCard` (cover, title link, authors, first published year, rating), `RatingDisplay` (average and count, or "No RePrint reviews yet"), in `apps/web/app/components/books/` | Built (M3-T15) |
| Author page | `AuthorPage` (round photo with initial fallback, name, life dates, bio; Books under a Role heading as `BookCard`s), in `apps/web/app/components/books/` | Built (M3-T20) |
| Book page | `BookPage` (`ground-deep` header band with breadcrumb, Series pill, `FactsRow`, actions; sticky `SectionNav`; collapsible description; `DetailsList`; `RatingBreakdown` beside the viewer's review panel; review list with star chips; 8/4 grid with `SeriesCard`, `AuthorCard`, `EditionsCard`; More by Author and More in Genre rails) in `apps/web/app/components/books/book-page.tsx` | Built (M3-T18, redesigned M9-T06) |
| Redesign (M9) | `GeneratedCover`, `StarRating` (partial fill for averages), `BookRail` (cover-first row: grid from `lg`, horizontal scroll below), `GenreTile` (three fanned mini covers), `ReviewExcerpt` (D-177), `SectionNav` (sticky in-page tabs with counts), `FactsRow` and `DetailsList` (`<dl>`), `RatingBreakdown` (bars are toggle buttons that filter), `SeriesCard`, `AuthorCard`, `EditionsCard` (format filter), `AuthorMatchCard` (search), `TrustBadge` (shield + "Read by a moderator"). Built in M9-T02 under `apps/web/app/components/books/` (`ReviewExcerpt` in `reviews/`); `Cover` takes `slug` (colour) and `dashed`, and `GeneratedCover` is exported from `cover.tsx` | Built (M9-T02) |
| Reviews | `StarRatingInput`, `SpoilerToggle`, `RatingSummary`, `ReviewCard` | M4 |

Rules: use the shadcn component before writing your own; new dependencies need a `docs/DECISIONS.md` entry; components never contain user-facing strings (props or `copy`).

## App shell

Skip link (first focusable) → header → `main#main` (`tabIndex=-1`, `max-w-page`) → footer. Header (`surface`, 76 px from `md`): the wordmark (serif "Re" with "Print" in the accent italic), main links (Discover, Genres, My library) inline from `md` and behind a menu button on phones, a pill search box that shows the current query on `/search` (own row on phones), and the account slot (Log in ghost and Create account pill; Create account hidden on phones). Footer (`ground-deep`): wordmark, the "Not a store" line, the Open Library credit, and the legal links. Buttons are pills everywhere (D-188). Footer: Open Library credit (PRD §6) and links to About, Terms, Privacy, Community Guidelines, and Contact (pages arrive in M8). Pages render content only; the shell owns `main`.

## Page templates

Every template starts with one `h1`, is server-rendered by its loader, and has loading, empty, and error states.

### Discover (`/`)

1. **Hero band** (`ground-deep`): `TrustBadge` (green pill), the hero `h1` with its last word in the amber italic, a lead, a large pill search field (60 px tall) with a Search button, and "Try" chips. On phones the search field and chips are hidden, since the header search sits right above. From `lg` the featured review sits on the right as a card with its cover, stars, headline, excerpt, reviewer, and "Read the full review".
2. **Your reading** (signed in only): Books on the viewer's Reading Shelf (and up to one Want to Read), plus a "Finished something? Write a review" prompt.
3. **Browse by genre:** 12 `GenreTile`s (6 across from `lg`, 3 at `md`, 2 at base) and "All genres".
4. **Top rated on RePrint:** a `BookRail` of 7 (with a note that the average is weighted), shelf button on each cover.
5. **This month** (5/7 split from `lg`): the top 5 of "Most reviewed this month" as an open numbered list with `recentReviewCount` on the right (D-179), beside 3 "Just approved" `ReviewExcerpt` cards (D-177). "Recently reviewed" (PRD §7.2) follows as a second `BookRail`.
6. **Sign-up pitch** (visitors only): heading, lead, the three Shelves, writing reviews, and helpful votes with tinted icons; "Create a free account" and "Log in" pills; from `lg` a drawn shelf of spines beside it.
7. **How a review gets here:** three steps ending in a link to the Community Guidelines.

Hidden rows (PRD §7.2) leave no heading or gap.

### Book page (`/books/:slug`)

1. **Header band** (`ground-deep`): breadcrumb (Discover › first Genre › title); Cover (300 px from `lg`, 200 px at `md`, 176 px centred at base) beside: Series pill ("Series · Book N of M"), `h1`, byline with roles ("by …, translated by …"), rating row (stars, average, and review count linking to `#reviews`), `FactsRow` (first published, pages, publisher, original language, Edition count), actions (shelf selector as the primary button, "Write a review", copy link), and Genre chips.
2. **`SectionNav`** (sticky): Overview, Reviews (count), Series (count), Editions (count), Author, Similar books. Items for empty sections are left out.
3. **8/4 grid from `lg`.** Main column: About this book (serif, collapsed after 6 lines), Details (`DetailsList` from the Primary Edition: format, published date, publisher, pages, language, original language, ISBN-13, translators), Reviews (rating breakdown card with the viewer's controls on the right, star filter chips and sort, review list, pagination). Side column: `SeriesCard` (reading order, "You're here", up-next shortcut), `AuthorCard` (photo, life dates, two-line bio, counts, link), `EditionsCard` (format filter, 5 Editions, "See all").
4. **Rows below** (full width): "More by <Author>" (with "All N books") and "More in <first Genre>" (with "Browse <Genre>"), 6 Books each.

The Reviews section opens with its heading and the inline moderation line, then one card holding the `RatingBreakdown` (72 px average, filtering bars) and the viewer's review panel on the right from `xl`; when the review form is open the panel takes the card's full width. Reviews are an open list: initials avatar, name, date, stars, serif headline, body, then the Helpful pill and Report.

Below `lg` the side column follows the reviews; on phones the actions become a two-button row and the facts a 2 × 2 grid.

### Search results (`/search`)

`h1` "Results for “…”" with Books and Authors tabs (counts). From `lg`, filters sit in a 260 px left panel (Genre checkboxes with counts, minimum rating, first-published decade chips, language, and the note that Genre, rating, and language filters only show Books already on RePrint); below `lg` they collapse into a disclosure. Above the list: an `AuthorMatchCard` when the query matches an Author well, then the result count split by Catalog and Source with Sort (its own GET form) on the right. The query lives in the header search box, so the page has no second search field. Each result: cover (112 px), Series line, serif title, Author and first published year, stars with average and review count, the `topReview` excerpt as a quote (D-177), Genre chips, and the shelf control. A Source candidate shows a dashed generated cover, "Not on RePrint yet", and "No RePrint reviews yet. Open it to be the first." 20 per page, numbered pagination.

### Review form

Single 40 rem column. Fields in order: star rating (radio group), headline with counter (120), body with counter (50 to 10,000), spoiler checkbox, optional Edition select. Errors show inline under the field (`aria-describedby`) and in a summary `Alert` that takes focus on submit. Primary "Submit for review" button; a note explains that reviews are moderated.

### Moderation queue (`/admin/reviews`)

Admin layout (below). Two panes from `lg`: a queue list on the left (oldest first, age and rating per row) and the selected review on the right (Book, reviewer history, rating, full text, spoiler flag, and a diff for edits). The action bar (Approve, Reject with reason picker) is sticky at the bottom of the right pane. Keyboard shortcuts are listed in a help dialog.

### Library (`/me/library`, `/users/:username/library`)

Tabs for the three Shelves with counts, then a grid of `BookCard`s (2 columns at base, 3 at `md`, 4 at `lg`) with sort options. Owner view adds a shelf selector on each card. Empty shelf: one sentence and a link to Discover.

### Public profile (`/users/:username`)

Header with avatar, display name, username, bio, and join date. Below: tabs for Reviews (Approved only) and Library (if public). Same list patterns as the book page reviews and library.

### Admin table pattern (`/admin/*`)

Admin layout: left nav from `lg` (a top disclosure below), `noindex`. Pages have title, filter bar, then a `Table` with sortable column headers (buttons with `aria-sort`), row actions in a `DropdownMenu`, and cursor or page pagination. Below `md` the table scrolls horizontally inside a focusable region (`tabIndex=0`, labelled) instead of the page scrolling.
