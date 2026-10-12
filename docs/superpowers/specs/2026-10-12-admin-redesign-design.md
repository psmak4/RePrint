# Admin section in the redesign style

- Date: 2026-10-12
- Status: Mockups approved by the owner (Design canvas, "Admin section" row); spec awaiting review
- Decisions to record: D-201 (this design)
- Mockups: RePrint Redesign canvas, boards `AdminDashboard`, `AdminReviewQueue`, `AdminUsers`, `AdminUserDetail`, `AdminGenres`, `AdminSystem`, `AdminUsersPhone`

## Problem

The public and account pages follow the redesign (DESIGN.md, D-176): warm bands, serif titles, white cards, pill buttons. The admin section uses the new colours and fonts but not the layout. Only Edit Book (D-196) was laid out in the new style. The rest:

- A tall "Administration" band repeats on every page, and each page adds its own `h2` under it.
- Users is a cramped table whose emails wrap mid-word; statuses and roles are plain text; "Show more" is a bare link.
- User detail is loose headings and definition lists with no cards.
- Genres and rules is one list about 12,800 px tall at 1440 px wide.
- System sets every number in 40 px serif, so "Nothing is waiting" wraps over two lines.
- Empty states are bare sentences, and secondary actions are underlined text links.

## Goal

Every `/admin/*` page matches the approved mockups: one shell, one set of building blocks, and the same behaviour as today. This is a web-only change: no API, schema, or permission changes, and no new dependencies.

## Decisions

1. **The page title moves into the band.** The band holds a breadcrumb ("Administration / Users", or "Administration / Users / @name"), the page's `h1`, a one-line lead, and the page's main actions on the right. The "Administration" heading goes away; the dashboard's band reads "Administration" as an eyebrow over the `h1` "Dashboard".
2. **Grouped sidebar with icons and counts.** Moderation (Dashboard, Review queue, Reports queue), People (Users, Audit log), Catalog (Catalog, Merge queue, Genres and rules, Featured content), Operations (System). Each link has a stroke icon; groups the viewer can see nothing in are left out. Review queue and Reports queue show a count badge from `GET /v1/mod/stats` when the viewer may moderate; a failed stats request just leaves the badges off. The current page uses the Series card's highlight (white surface, border, accent icon).
3. **Shared admin building blocks** in `apps/web/app/components/admin/`: a card, status and role badges, a table style (tinted header row, right-aligned tabular numbers, no wrapping mid-word, long text cut with an ellipsis), stat tiles in sans (never the serif for numbers), an empty state (icon, sentence, optional pill), and pill buttons for every action that was an underlined text link (Show more, Back to …, Open the … queue). Icons are inline stroke SVGs in one file, as elsewhere in the app.
4. **No new dependencies.** The mockups' "⋯" row menu becomes plain small buttons (Edit, then Archive or Restore), since the app has no menu component and DESIGN.md's `DropdownMenu` was never added. DESIGN.md's admin table pattern is updated to say so.
5. **Phone layout.** The sidebar and the filters each collapse behind a full-width button (the sidebar already does). The Users table turns into a list of tappable account rows below `md` (mockup `AdminUsersPhone`); other tables keep the focusable horizontal scroll region.

## Shell

- `AdminLayout` (the `/admin` route) keeps the permission gate and builds the grouped nav, adding the counts from `/v1/mod/stats`. It renders `<Outlet>` with the nav in the outlet context and no band of its own.
- A new `AdminPage` component, used by every admin page, renders the band (breadcrumb, `h1`, lead, actions, and an optional `leading` slot such as an avatar or a cover, plus an optional slot under the title for tabs), then the sidebar and the page content side by side from `lg`. It reuses `PageHero`'s band (full-bleed `ground-deep`) at a smaller title size (44 px from `md`, 34 px below).
- Page `<title>`s are unchanged.

## Pages

| Page | What changes |
| --- | --- |
| Dashboard `/admin` | Two stat cards: Pending reviews (count, an amber "Oldest has waited …" badge, "Open the review queue" pill) and Open reports (count, "Open the reports queue" pill). A "Waiting longest" card lists the 3 oldest pending reviews from `GET /v1/mod/reviews?limit=3` (generated mini cover, title, @reviewer, stars, age badge, Open pill) with "See all N". When both queues are empty the cards say so with a green check and the list is left out. |
| Review queue `/admin/reviews` | Two panes from `lg` (today's structure): the list card (mini cover, serif title, @reviewer, stars, age badge, Edited badge; the open one highlighted) and the review card: a blue "Claimed by you until …" strip, Book with mini cover and Author, reviewer history as badges (approved, rejected, reported), stars and spoiler badge, serif headline and body, the existing edit diff, and a sticky bar with today's shortcut line (keys shown as `<kbd>`), Reject (red outline) and Approve (primary). The reject reason picker keeps its behaviour. Empty state when nothing waits. (The mockup's "Keyboard shortcuts" band button is dropped: the app has no shortcuts dialog, and the line in the bar already says them.) |
| Reports queue `/admin/reports` | Stays a stacked list (today's structure). Each reported review becomes a card in the review queue's style: Book with mini cover, reviewer, stars, the review text, the reports (reason badges, reporter, age), and today's actions as pills (destructive ones in red outline). "Show more" pill. Empty state. |
| Users `/admin/users` | Filter card (search with icon, Role, Status, Joined from and to; Clear and Apply). Table card: Member (avatar, name, @username), Email (one line, ellipsis), Status badge, Role badges (Member alone shows as plain text), Joined, Reviews, Reports. "Show more" pill. Phone: row list as in `AdminUsersPhone`. |
| User detail `/admin/users/:id` | Band: avatar, display name as `h1`, "@username · Joined …", status and role badges; the role, end-sessions, and suspend actions as pills on the right (Suspend in red outline). Grid 2:1: Profile (email with Verified badge, bio, joined, Public profile link), Reviews (four count tiles), Audit history (timeline) on the left; Reports (two tiles) and Sessions (device list) on the right. |
| Audit log `/admin/audit` | Filter card and table card in the Users pattern; Export CSV as an outline pill in the band; before/after values keep their disclosure. |
| Catalog `/admin/catalog` | Band actions: Merge queue and Genres and rules pills (replacing the text links). Find a Book in a card; totals as stat tiles; Monthly growth as a table card. |
| Merge queue `/admin/catalog/merge` | Each pair is a card with the two Books side by side and Keep / Not a duplicate pills; the confirm step keeps its copy. Empty state. |
| Genres and rules `/admin/catalog/genres` | Band action "Add a Genre"; tabs Genres and Subject rules under the title, each with its count, chosen by `?tab=rules` (Genres by default) so each tab is its own server-rendered page. Genres tab: a "Find a Genre" field and a "Show archived" checkbox that filter the loaded list in the browser, then a table (name and slug, Parent, Books, Rules, Edit and Archive or Restore buttons; child Genres indented under their parent; archived rows muted with an Archived badge). "Add a Genre" opens the form as a card above the table; a row's Edit opens the same card filled in. Subject rules tab: the add-rule form as a card, then a table (pattern, Genre, priority, Remove). |
| Featured content `/admin/featured` | Featured Genres and Featured review as cards; the Genre order list keeps its Up, Down, Remove buttons as small pills. |
| System `/admin/system` | Band: an "Updated at … · refreshes every 30 s" badge. Source requests card (circuit breaker as a green or red badge, requests per second with a bar against the limit), Search cache card (hit rate with a bar, hits and misses), Job queue card (Waiting, Active, Delayed, Failed tiles; oldest waiting job as a line). Numbers in sans. |
| Edit Book `/admin/books/:id` | Its header (cover, "Edit Book" eyebrow, title, Author, "View the Book page") moves into the band; the rest is unchanged. |

Every page keeps its loader, actions, copy keys (new strings go in `apps/web/app/copy/`), permission checks, and error and empty states.

## Testing

- Component tests for each admin component keep querying by role and name; they gain checks for the new pieces: the band `h1` and breadcrumb, nav groups and counts (and no badges when stats fail), status badges, the Genres tabs and the browser-side filter, the dashboard's "Waiting longest" list and empty state.
- Route tests: the layout loader with and without moderate permission, and with `/mod/stats` failing; the dashboard loader's queue request.
- e2e: `admin.spec.ts` checks each page's own `h1` instead of "Administration", plus axe on every admin page at desktop and phone widths (the existing sweep, extended). Moderation, reports, and Edit Book specs updated only where a heading or link name changes.
- Visual check: screenshots of every admin page at 1440 and 390 px compared with the mockups before the PR.

## Docs

- DESIGN.md: the admin layout and table pattern rewritten to match; the component inventory gains the admin building blocks.
- D-201 in DECISIONS.md; an M9-T20 entry in TASKS.md; a PROGRESS note.

## Out of scope

- Public and account pages (already in the redesign).
- Any API, schema, or permission change.
- A dropdown menu component.
