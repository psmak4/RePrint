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
- No horizontal scrolling at 360 px, except inside tables (see Admin section).

## Type scale

Two typefaces (D-180), self-hosted from the Google Fonts files via Fontsource, Latin subset, preloaded, `font-display: swap`, with metric-adjusted fallbacks:

- `--font-serif`: Newsreader (variable). Titles, section headings, review headlines, Book descriptions, and review excerpts.
- `--font-sans`: Instrument Sans (variable). Everything else: UI, labels, meta, body text of reviews.

| Role | Font | Size / line height (base → `md`) | Weight |
| --- | --- | --- | --- |
| Hero title (Discover h1) | serif | 40/42 → 64/66, tracking −0.02em | 500 |
| Book title (Book page h1) | serif | 38/40 → 60/62, tracking −0.02em | 500 |
| Page title (every other h1: `PageHero`, admin, search) | serif | 32/36 → 44/48, tracking −0.02em | 500 |
| Auth card title (the auth card's h1) | serif | 32/35 → 38/42 | 500 |
| Section title (h2), on every page including Discover | serif | 26/30 → 32/36, tracking −0.01em | 500 |
| Card or panel title (h3) | serif | 21/26 → 22/28 | 500 |
| Review headline | serif | 21/26 → 24/30 | 500 |
| Book title on a card | serif | 16/20 → 18/22 | 500 |
| Long text (description) | serif | 18/29 → 19/31 | 400 |
| Body | sans | 16/24 (review bodies 16/27) | 400 |
| Lead | sans | 16/25 → 19/29 | 400 |
| Secondary, meta | sans `text-muted-foreground` | 14/20 | 400 |
| Eyebrow label (also the Book facts' labels) | sans, uppercase, tracking 0.12em | 12/16 → 13/16 | 600 |

Pages take the page title, section title, card title, and eyebrow classes from `textStyles` in `@reprint/ui` (D-214); the style guard fails on a serif `h1` or `h2` with its own size outside Discover's hero, the Book header, and the auth card. One `h1` per page; do not skip heading levels. Body text never goes below 14 px; only eyebrow labels and badge counts use 12 or 13 px.

Source text (Book descriptions, Author bios, Series descriptions) is Markdown and renders through `RichText` (D-202): paragraphs 16 px apart, italic and bold, lists indented with markers, and outside links in `text-link`, underlined, same tab. It keeps the surrounding type (serif for a description, sans for a bio); headings or images in the text become plain text so the page's own outline stays intact. Excerpts (the Author card's three lines, meta descriptions) use its plain text.

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
| `star` | `#a8500a` (same value as `warning`) | Filled stars and rating bars only (decorative: a rating always shows its number too) |
| `strong` | `#334155` | Text that needs more weight than `muted-foreground`: inactive tabs and nav links, footer links, lead paragraphs |
| `chip-border` | `#d9d4ca` | Chip and pill-link edges, quiet card edges that sit on the band |
| `dashed-border` | `#a8a29e` | Dashed boxes: empty states, the spoiler box, the dashed "not on RePrint yet" cover |
| `surface-tint` | `#fdfcfa` | Quiet insets on a white surface: table row hover, a card's footer strip |
| `track` | `#ece8e0` | Rating bar tracks and count chips |
| `star-empty` | `#d6d3d1` | Empty stars (decorative) |
| `cover-ink` | `#fdfaf3` | Text on generated covers and the drawn shelf of spines |
| `accent-tint` / `accent-edge` | `#eff6ff` / `#bfdbfe` | Blue badges, the pressed Helpful pill, selected rows, avatar placeholders |
| `success-tint` / `success-edge` | `#ecfdf3` / `#a7f3d0` | Green badges, the trust badge, success notices |
| `warning-tint` / `warning-edge` | `#fff7ed` / `#fed7aa` | Amber badges, the spoiler box, the verification banner |
| `danger-tint` / `danger-edge` | `#fef2f2` / `#fecaca` | Red badges, error summaries, the danger button's hover |

Pages use these tokens only. A raw hex colour in a class name fails the style guard (`apps/web/app/style-guard.test.ts`), except in the two decorative palettes: generated covers (`lib/cover-color.ts`) and initials avatars (`lib/avatar.ts`).

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
| strong | 9.9 / 10.4 / 9.2 / 9.0 | Text 4.5:1 |
| accent (focus ring) | 5.0 / 5.2 / 4.6 / 4.5 | UI 3:1 |
| input-border | 3.9 / 4.0 / 3.6 / 3.5 | UI 3:1 |
| accent-foreground on accent / accent-hover | 5.2 / 6.7 | Text 4.5:1 |

Amber (`star`) only ever means a rating or a featured label; it is never an action colour. Body copy that needs more weight than `muted-foreground` uses `strong` (9.9:1 on background). Status text sits on its own tint (`danger` on `danger-tint`, and so on), and `foreground`, `strong`, and `muted-foreground` stay above 4.5:1 on every tint and on `track`.

### Image covers

A real cover is never cropped. Its 2:3 space is reserved up front (no layout shift), the image is scaled to fit and sits at the bottom of that space, and the spine shadow and corners go on the image itself, so covers a little narrower or wider than 2:3 keep their whole artwork. Rows and grids add a `srcset` with the next Open Library size for high-density screens. The Book header loads the largest size eagerly with high fetch priority, since it is the page's largest image.

### Generated covers

A Book with no Cover image gets a generated cover: a solid colour chosen by hashing the slug into this list, `#1e3a8a #312e81 #155e75 #134e4a #14532d #3f6212 #713f12 #7c2d12 #9a3412 #831843 #4c1d95 #57534e`, with a 1 px inset frame at 32% opacity, the author in small uppercase at the top, the title in the serif in the middle, and a short rule below. Text is `#fdfaf3` (at least 6.5:1 on every colour; the author line at 88% opacity stays above 4.5:1). Sizes scale with the cover through container query units, so one component serves 44 px thumbnails and the 300 px Book header.

## Component inventory

Components come from shadcn/ui, copied into `packages/ui/src/components/`, restyled with the tokens above. App-specific components live in `apps/web/app/components/`.

| Need | Component | Status |
| --- | --- | --- |
| Buttons | shadcn `Button` (default, secondary, outline, ghost, danger, overlay; sm 40 / 14 px, default 44 / 15 px, lg 48 / 16 px, icon 44 px round, icon-sm 36 px round). Every pill-shaped action and action link uses it, through `asChild` or `buttonVariants` (D-214); the style guard fails on a hand-built pill. The only pill-shaped elements drawn elsewhere are fields: the header search box and Discover's hero search field, whose Search button keeps the field's 60 px height | Built (M1-T11, M11-T03) |
| Chips | `Chip` / `chipVariants` (34 px, 14 px medium, `chip-border` edge, accent fill when `selected`, `interactive={false}` for a fact): Genre chips, Discover's "Try" chips, child Genres, the Series pill, review star filters, the Editions format filter, profile totals, and the Book editor's chosen Genres. The style guard fails on a hand-built chip | Built (M11-T04) |
| Form fields | shadcn `Input`, `Textarea`, `Label`, `Checkbox`, `RadioGroup`, `Form` (React Hook Form); `Select` is a native `<select>` (D-198) | `Input`, `Label` built (M2-T10); `Textarea`, `Checkbox` built (M2-T19); `Select` built (M9-T17: our chevron, and a page-drawn open list where the browser supports `appearance: base-select`); `AuthForm` in `apps/web/app/components/auth/`; rest as needed |
| Feedback | shadcn `Alert`, `Sonner` toast, `Badge` (status: pending, approved, rejected, unpublished) | Add as needed |
| Overlays | `Menu` (`components/common/menu.tsx`): a native `<details>` that opens without JavaScript and, with it, closes on navigation, on Escape (focus back to its button), on a click outside, and when another menu opens; its rows use `menuItemClass` (44 px). The phone menu, account menu, and notifications use it (D-214). shadcn `Dialog`, `AlertDialog`, `Popover`, `Tooltip` as needed | `Menu` built (M11-T08) |
| Navigation | shadcn `Tabs` (search Books/Authors), `Pagination`, `Breadcrumb` | Add as needed |
| Data | shadcn `Table`, `Skeleton`, `Separator`, `Avatar` | Add as needed |
| Combobox | `SearchBox` in `apps/web/app/components/shell/`: hand-built ARIA combobox for header search suggestions (D-108) | Built (M3-T16) |
| App shell | `AppShell`, `SiteHeader` (logo, search slot, account slot), `SiteFooter` (Open Library credit, legal links), skip link | Built (M1-T12) |
| Books | `Cover` (2:3, generated fallback), `BookCard` (cover, title link, authors, first published year, rating), `RatingDisplay` (average and count, or "No RePrint reviews yet"), in `apps/web/app/components/books/` | Built (M3-T15) |
| Author page | `AuthorPage` (round photo with initial fallback, name, life dates, bio; Books under a Role heading as `BookCard`s, most reviewed then most Editions first; Written shows 24 at a time with a "Show more (N more)" pill and a "Still adding" status line while a bibliography import runs, D-203), in `apps/web/app/components/books/` | Built (M3-T20) |
| Book page | `BookPage` (`ground-deep` header band with breadcrumb, Series pill, `FactsRow`, actions; sticky `SectionNav`; collapsible description; `DetailsList`; `RatingBreakdown` beside the viewer's review panel, and under it a muted "Ratings elsewhere" panel with other Sources' reader ratings, one line per Source with "Show breakdown" (D-204); review list with star chips; 8/4 grid with `SeriesCard`, `AuthorCard`, `EditionsCard`; More by Author and More in Genre rails) in `apps/web/app/components/books/book-page.tsx` | Built (M3-T18, redesigned M9-T06) |
| Redesign (M9) | `GeneratedCover`, `StarRating` (partial fill for averages), `BookRail` (cover-first row: grid from `lg`, horizontal scroll below), `GenreTile` (three fanned mini covers), `ReviewExcerpt` (D-177), `SectionNav` (sticky in-page tabs with counts), `FactsRow` and `DetailsList` (`<dl>`), `RatingBreakdown` (bars are toggle buttons that filter), `SeriesCard`, `AuthorCard`, `EditionsCard` (format filter), `AuthorMatchCard` (search), `TrustBadge` (shield + "Read by a moderator"). Built in M9-T02 under `apps/web/app/components/books/` (`ReviewExcerpt` in `reviews/`); `Cover` takes `slug` (colour) and `dashed`, and `GeneratedCover` is exported from `cover.tsx` | Built (M9-T02) |
| Reviews | `StarRatingInput`, `SpoilerToggle`, `RatingSummary`, `ReviewCard` | M4 |
| Admin | `AdminPage` (band, grouped nav), `AdminCard`, `Badge`, `StatTile`, `EmptyState`, `Kbd`, table classes, `ScrollRegion`, `AdminIcon`, in `apps/web/app/components/admin/`; `Button` gains a `danger` variant | Built (M9-T20, D-201) |

Rules: use the shadcn component before writing your own; new dependencies need a `docs/DECISIONS.md` entry; components never contain user-facing strings (props or `copy`).

## App shell

Skip link (first focusable) → header → `main#main` (`tabIndex=-1`, `max-w-page`) → footer. Header (`surface`, 76 px from `md`): the wordmark (serif "Re" with "Print" in the accent italic), main links (Discover, Genres, My library) inline from `md` and behind a menu button on phones, a pill search box that shows the current query on `/search` (own row on phones), and the account slot: Log in (ghost) and Create account (pill, hidden on phones) for Visitors; for Members a `Menu` under their name with Your profile, Your library, Settings, Admin (only with an admin-area permission), and Log out. Footer (`ground-deep`): wordmark, the "Not a store" line, the Open Library credit, and the legal links. Buttons are pills everywhere (D-188). Footer: Open Library credit (PRD §6) and links to About, Terms, Privacy, Community Guidelines, and Contact (pages arrive in M8). Pages render content only; the shell owns `main`.

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
3. **8/4 grid from `lg`.** Main column: About this book (serif, collapsed after 6 lines), Details (`DetailsList` from the Primary Edition: format, published date, publisher, pages, language, original language, ISBN-13, translators), Reviews (rating breakdown card with the viewer's controls on the right, star filter chips and sort, review list, pagination). Side column: `SeriesCard` (reading order with "Book N of M" when the Source's Series size is known; the current Book gently highlighted with `aria-current`, no label; up to 8 Books around the current one and "See all N" for longer Series, D-199; no separate up-next link), `AuthorCard` (photo, life dates, two-line bio, counts, link), `EditionsCard` (format filter, 5 Editions, "See all").
4. **Rows below** (full width): "More by <Author>" (with "All N books") and "More in <first Genre>" (with "Browse <Genre>"), 6 Books each.

The Reviews section opens with its heading and the inline moderation line, then one card holding the `RatingBreakdown` (72 px average, filtering bars) and the viewer's review panel on the right from `xl`; when the review form is open the panel takes the card's full width. Reviews are an open list: initials avatar, name, date, stars, serif headline, body, then the Helpful pill and Report.

Below `lg` the side column follows the reviews; on phones the actions become a two-button row and the facts a 2 × 2 grid.

### Search results (`/search`)

`PageHero` (trail Discover / Search results) with the title "Results for “…”" and the Books and Authors tabs on its edge. From `lg`, filters sit in a 260 px left panel (Genre checkboxes with counts, minimum rating, first-published decade chips, language, and the note that Genre, rating, and language filters only show Books already on RePrint); below `lg` they collapse into a disclosure. Above the list: an `AuthorMatchCard` when the query matches an Author well, then the result count split by Catalog and Source with the `SortControl` on the right. The query lives in the header search box, so the page has no second search field. Each result: cover (112 px), Series line, serif title, Author and first published year, stars with average and review count, the `topReview` excerpt as a quote (D-177), Genre chips, and the shelf control. A Source candidate shows a dashed generated cover, "Not on RePrint yet", and "No RePrint reviews yet. Open it to be the first." 20 per page, with the `Pager`.

### Shared page frames

- **`PageHero`** opens every page except Discover, the Book page, and the auth card: Genres, Genre, Author, Series, search, Library, profile, settings, static pages, and every admin page (through `AdminPage`). The `ground-deep` band holds, in order: the `Breadcrumb` trail, which starts at Discover and ends with the current page; an optional avatar or cover; an optional small type label ("Author", "Series"); the page title; a lead; actions on the right; anything the page adds (chips, totals); and `TabNav` tabs on its bottom edge (D-214).
- **`Breadcrumb`** (`components/common/breadcrumb.tsx`) is the one trail, also used by the Book header: links in `strong`, the current page in `foreground` with `aria-current="page"`, `/` between.
- **`TabNav`** (`components/common/tab-nav.tsx`): underlined tabs, 52 px tall, 16 px medium, a 2 px accent underline on the current tab, and a `track` count chip when the page knows the count (the tab is then named "Label (N)"). It sits on the band's bottom edge on Settings, admin Genres, Library, profile, and search; the Book page's sticky section nav uses the same tab style.
- **`AuthCard`** is the centered white card (460 px, 24 px corners) for log in, register, password recovery, email verification and change, the error page, and the resolve page: serif title, lead, body, a full-width pill for the one next step, and links under the card.
- **`SortControl`** (`components/common/sort-control.tsx`) is the one sort: "Sort by" and the compact `Select` in a GET form that keeps the page's other choices. A pick applies at once through React Router, with focus left on the dropdown and the scroll position kept; an Apply button inside `<noscript>` submits the form without JavaScript. Search, the Library, Book reviews, and the Genre page use it. Filter panels with several fields (search, admin Users, audit log) keep one primary "Apply filters" button, and every sort and filter form navigates in the app.
- **`Pager`** (`components/common/pager.tsx`) is the one pager: Previous and Next as outline pills with "Page N of M" (or "Page N") between, on the Library, profile, Genre, search, Book reviews, and the admin catalog search. Lists that grow in place (the Author's Written list, the admin queues, Users, the audit log) end with **`ShowMore`**, a centred outline pill. The style guard fails on a sort dropdown outside `SortControl` or a `rel="prev"`/`rel="next"` link outside `Pager`.
- **`EmptyState`** (`components/common/empty-state.tsx`) is the one dashed box: a `dashed-border` edge, 16 px corners, 15 px `strong` text, an optional check (the admin queues' "all caught up") and an optional action. Empty Shelves and Genres, the review queue's prompt, the admin lists, search's ISBN tip, and Discover's "Finished something?" prompt use it; only the dashed "not on RePrint yet" cover and the spoiler box draw their own dashes, and the style guard checks.
- **Filters on phones** open from one toggle look (`components/common/filters-toggle.tsx`): a full-width outline pill with the filter icon, the label, and a chevron, on search (below `lg`) and the admin Users and audit log (below `md`).
- **Tab titles** read "<page> | RePrint" (`pageTitle` in `lib/seo.ts`) on every page but Discover, which leads with the name; error pages set theirs too.
- **`BookGrid` / `BookTile`** show Books cover-first everywhere outside rails (2, 3, 4, then 6 across; `narrow` stops at 4 beside a sidebar). A tile reads its rating as one phrase for screen readers and says "No RePrint reviews yet" when it has none.
- Form controls are 44 px tall with 10 px corners and 15 px text; labels are 15 px semibold. Settings sections and admin tables sit in `surface` cards. Every surface card and panel has 16 px corners (insets inside a card 12 px); the auth card keeps 24 px as a page frame, and the style guard checks both.

### Review form

Single 40 rem column. Fields in order: star rating (radio group), headline with counter (120), body with counter (50 to 10,000), spoiler checkbox, optional Edition select. Errors show inline under the field (`aria-describedby`) and in a summary `Alert` that takes focus on submit. Primary "Submit for review" button; a note explains that reviews are moderated.

### Moderation queue (`/admin/reviews`)

Admin layout (below). Two panes from `lg`: a queue list on the left (oldest first, age and rating per row) and the selected review on the right (Book, reviewer history, rating, full text, spoiler flag, and a diff for edits). The action bar (Approve, Reject with reason picker) is sticky at the bottom of the right pane. Keyboard shortcuts are listed in a help dialog.

### Genres (`/genres`) and Genre (`/genres/:slug`)

Both open with the `PageHero` band (`ground-deep`): breadcrumb, the page title, and a lead. The index is a grid of `GenreTile`s (2 across at base, 3 at `md`, 6 at `lg`); a child Genre is a small chip under its parent's tile. A Genre page adds its child Genres as pill links in the band, then the `SortControl` (Top rated, Most reviewed, Newest review), the Books as a `BookGrid` (2, 3, 4, then 6 across), and the `Pager`.

### Library (`/u/:username/library`)

`PageHero` with the trail Discover / <username> / Library, an initials avatar, "<username>'s library" (or "Your library" for the owner), the shelved count, and the Shelf tabs (All, Reading, Want to Read, Read) with counts on its edge. Below: sort on the right. The Books are a `BookGrid`; in the All tab each tile is labelled with its Shelf, and the owner gets the bookmark shelf control on each cover. An empty Shelf is the `EmptyState` with one sentence and a "Find something to read" pill. A private (or missing) Library is the band alone with the private message.

### Public profile (`/users/:username`)

`PageHero` with the trail Discover / <display name>, the avatar, display name, username, join date, bio, and totals, and on its edge the tabs Reviews (Approved only, with the count) and Library (if public, a link to the Library page). Same list patterns as the book page reviews and library.

### Admin section (`/admin/*`, D-201)

Mockups: the "Admin section" row of the RePrint Redesign canvas. Every admin page renders `AdminPage`, and the `/admin` layout passes it the grouped nav through the outlet context. `noindex`.

- **Band**: the shared `PageHero`, with the trail Discover / Administration / section / item (the dashboard's is Discover / Administration), the page title (`textStyles.pageTitle`, as on every other band), a one-line lead, and the page's main actions as pills on the right. `leading` holds an avatar (user detail) or a cover (Edit Book); `below` holds tabs (Genres and rules: underlined tabs with count chips, chosen by `?tab=rules`).
- **Nav:** grouped Moderation (Dashboard, Review queue, Reports queue), People (Users, Audit log), Catalog (Catalog, Merge queue, Genres and rules, Featured content), Operations (System), each link with a stroke icon. Review queue and Reports queue carry a count badge from `/v1/mod/stats` for viewers who may moderate; the badge reads "…, N waiting" to screen readers and is left off when the stats fail. The current page uses a white surface, a border, and an accent icon. Left column (224 px, 32 px gap) from `lg`; a full-width "Admin menu" disclosure below.
- **Building blocks** (`components/admin/admin-ui.tsx`): `AdminCard` (white, 16 px corners, serif `h2` title that names the region, optional `actions`, `flush` for tables), `Badge` (green, amber, red, blue, gray; optional dot; `USER_STATUS_TONE` for account status), `StatTile` (label and number in the sans with `tabular-nums`, never the serif), `EmptyState` (the shared dashed box with the green check), `Kbd`, and the table classes (tinted header row, uppercase 12 px headers, right-aligned numbers, long values truncated with a `title`).
- **Actions** are pills (`Button`, or `Button asChild` around a link): primary for the one main action, outline for the rest, `danger` (red outline) for Reject, Unpublish, Suspend, Merge, and Remove. Row actions are small buttons in the last column (there is no dropdown menu component). "Show more" is the shared `ShowMore` (a centred outline pill); filter panels submit with one primary "Apply filters" button.
- **Tables** sit in `ScrollRegion` (focusable, labelled, `relative` so sr-only text cannot widen the page); the page never scrolls sideways at 390 px (an e2e check, also run with a Member at every length limit). Users shows the email under the name (no Email column; name, username, and email each stop at 200 px with an ellipsis and a `title`, so the table fits beside the nav at 1440 px even with a 50-character name, an e2e check), swaps its table for a list of tappable rows below `md`, and collapses its filters, and the audit log's, behind a "Filters" button there. Free text outside tables breaks (`break-words`, or `Badge wrap` for a pill such as a merge reason); text that sits beside a badge in a flex row gets its own element so it can break.
- **Queues:** the review queue is two panes from `lg` (list card with the open review highlighted like the Series card; the review card with a blue "Claimed by you" or amber "held by" strip, reviewer history badges, serif text, and a sticky bar with the shortcut keys, Reject, and Approve). Reports and the merge queue are stacked cards.
