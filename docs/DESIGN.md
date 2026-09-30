# RePrint design system

Source of truth for UI work (PRD §8, §11). Tokens live in `packages/ui/src/theme.css`; strings live in `apps/web/app/copy/`. Dark theme only for v1.

## Principles

- Reading and reviews come first: content on a calm dark surface, one accent colour for actions.
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

System font stack (`--font-sans`); no web fonts, so nothing blocks first paint.

| Role | Tailwind | Size / line height | Weight |
| --- | --- | --- | --- |
| Page title (h1) | `text-3xl md:text-4xl` | 30/36, 36/40 | 600 |
| Section title (h2) | `text-2xl` | 24/32 | 600 |
| Subsection (h3) | `text-xl` | 20/28 | 600 |
| Card title | `text-base` | 16/24 | 600 |
| Body | `text-base` | 16/24 | 400 |
| Lead / description | `text-lg` | 18/28 | 400 |
| Secondary, meta | `text-sm text-muted-foreground` | 14/20 | 400 |

One `h1` per page; do not skip heading levels. Body text never goes below 14 px.

## Spacing scale

Tailwind's 4 px scale, using only: 1 (4), 2 (8), 3 (12), 4 (16), 6 (24), 8 (32), 12 (48), 16 (64). Inside a component use 2 to 4; between components 6 or 8; between page sections 12. Touch targets are at least 44 × 44 px on mobile (`h-11`), 24 × 24 px at minimum anywhere (WCAG 2.5.8).

## Colour tokens

Exposed as Tailwind v4 theme variables (`bg-background`, `text-muted-foreground`, and so on) from `@reprint/ui/theme.css`.

| Token | Value | Use |
| --- | --- | --- |
| `background` | `#0f172a` | Page background |
| `foreground` | `#f8fafc` | Body text |
| `surface` | `#1e293b` | Cards, inputs, menus |
| `surface-raised` | `#273449` | Hover state, popovers |
| `muted-foreground` | `#94a3b8` | Secondary text |
| `border` | `#334155` | Decorative dividers only |
| `input-border` | `#64748b` | Input and outline-button boundaries |
| `accent` | `#3b82f6` | Primary buttons, selected state, focus ring (`ring`) |
| `accent-foreground` | `#020617` | Text on `accent` |
| `link` | `#60a5fa` | Text links (underlined) |
| `danger` / `success` / `warning` | `#f87171` / `#4ade80` / `#fbbf24` | Status text and icons; never colour alone, always with text or an icon |

### Contrast (WCAG AA), enforced by `packages/ui/src/theme.test.ts`

| Pair | Ratio | Rule |
| --- | --- | --- |
| foreground on background / surface | 17.1 / 14.0 | Text 4.5:1 |
| muted-foreground on background / surface | 7.0 / 5.7 | Text 4.5:1 |
| link on background / surface | 7.0 / 5.7 | Text 4.5:1 |
| danger on background / surface | 6.5 / 5.3 | Text 4.5:1 |
| accent-foreground on accent | 5.5 | Text 4.5:1 |
| accent (focus ring) on background / surface | 4.9 / 4.0 | UI 3:1 |
| input-border on background / surface | 3.8 / 3.1 | UI 3:1 |

Do not use `accent` for text (4.0:1 on `surface`); use `link`. Do not put `foreground` on `accent` (3.5:1).

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
| Book page | `BookPage` (header, collapsible description, native `<details>` Editions, More by author) in `apps/web/app/components/books/book-page.tsx` | Built (M3-T18) |
| Reviews | `StarRatingInput`, `SpoilerToggle`, `RatingSummary`, `ReviewCard` | M4 |

Rules: use the shadcn component before writing your own; new dependencies need a `docs/DECISIONS.md` entry; components never contain user-facing strings (props or `copy`).

## App shell

Skip link (first focusable) → header → `main#main` (`tabIndex=-1`, `max-w-page`) → footer. Header: logo left, search slot (own row below the logo at base, inline from `md`), account slot right. Footer: Open Library credit (PRD §6) and links to About, Terms, Privacy, Community Guidelines, and Contact (pages arrive in M8). Pages render content only; the shell owns `main`.

## Page templates

Every template starts with one `h1`, is server-rendered by its loader, and has loading, empty, and error states.

### Book page (`/books/:slug`)

Header band: Cover (2/3 aspect, 160 px at base, 224 px from `md`) beside title, subtitle, contributors with roles, Series link, and meta row (year, pages, publisher); Genre tags below. Then, in one 8/4 grid from `lg`: main column with description (collapsed at 6 lines), rating summary, "my controls", reviews (sort and star filter above, 10 per page); side column with Editions (collapsible) and More by this author. Below `lg` the side column follows the reviews.

### Search results (`/search`)

Tabs (Books, Authors) under the `h1` "Results for …". Filters (genre, language, minimum rating, decade) and sort in a left 3-column panel from `lg`, in a collapsible disclosure above the list below it. Results are a vertical list of `BookCard`s (cover left, text right), 20 per page, with numbered pagination. Source-unavailable note sits above the list as an `Alert`.

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
