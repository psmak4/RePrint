# RePrint: instructions for every session

RePrint is a server-rendered web app for discovering books and reading and writing trustworthy, moderated reviews. Every review is approved by a moderator before it is published; personal libraries (shelves) are a secondary feature that brings readers back. Principles (PRD §1): **discovery and reviews come first**; **trust over volume** (verified accounts, one review per Member per Book, every review moderated); **RePrint owns its data model** (outside Sources are translated into RePrint vocabulary, and no provider terms or IDs leak out); **production-ready from day one** (security, recovery, tests, CI/CD, monitoring, and accessibility are v1 work). `PRD.md` is the source of truth. If this file and the PRD disagree, the PRD wins.

## Vocabulary (PRD §5): use only these terms

Use RePrint terms in UI copy, API fields, DB tables and columns, and code. Source-specific words (Open Library "work", "key", "OLID"; Google "volume"; and so on) may appear **only inside `apps/api/src/catalog/sources/<name>/`**. A Source ID never appears in a URL, API response, or foreign key (it lives only in `source_links`).

| Term | Meaning |
| --- | --- |
| Book | A title across all printings, formats, and translations. Reviews, ratings, shelves, and votes attach here |
| Edition | One published version of a Book (ISBN-13, Format, Language, publisher, and so on) |
| Primary Edition | The Edition that represents the Book (auto-chosen or set by an admin) |
| Author / Contribution | A person / a link from Author to Book with a Role (author, co_author, translator, illustrator, editor, narrator, other) |
| Series | A named, ordered set of Books. Position may be decimal or empty |
| Genre / Subject | A curated browse category (about 40) / a raw Source tag mapped to Genres (never shown as a category) |
| Cover / Format / Language | Image with origin and sizes / hardcover, paperback, ebook, audiobook, unknown / ISO 639 code |
| Catalog / Source / Source link / Source record | RePrint's store / outside provider / Catalog-to-Source ID link / raw response kept 30 days |
| Field origin / Storage policy | Who set each field and when ("admin" means locked) / Store, Cache, or None |
| Member (`User` in code) | A registered account |
| Review / Review status / Review version | Rating (1 to 5) plus text / pending, approved, rejected, unpublished / each submitted version plus its decision |
| Helpful vote / Report | A Member marking another Member's Approved Review helpful / a flag on an Approved Review |
| Shelf / Shelf entry / Library | want_to_read, reading, read / a Book on a Shelf (one per Member per Book) / all of a Member's Shelf entries |

## Repo layout (PRD §8)

```
apps/web         React Router 8 framework mode, SSR (Netlify). Routes, loaders/actions, page components
apps/api         Fastify 5 API (src/server.ts) + BullMQ worker (src/worker.ts → dist/worker.js)
  src/catalog/sources/<name>/   Source adapters (the only place Source vocabulary is allowed)
  src/modules/<area>/           routes, services, and preHandlers per area (auth, me, catalog, reviews, ...)
packages/shared  Zod schemas, domain types, permission names, constants, pure domain logic (weighted rating, slugs, ISBN)
packages/db      Drizzle schema, drizzle-kit migrations, seed scripts, test DB helpers
packages/email   React Email templates
packages/ui      shadcn/ui components + Tailwind v4 theme (light palette #fbfaf7 / #2563eb / #0f172a, D-176; replaces PRD §8's dark palette)
packages/config  Shared tsconfig bases and Biome config
e2e/             Playwright specs + axe checks (root workspace package)
docs/            TASKS, PROGRESS, BLOCKERS, DECISIONS, DESIGN, milestones/
```

- Request/response schemas and user-facing enums go in `packages/shared`. Never redefine them in an app.
- Tables go in `packages/db/src/schema/`. Generate migrations with `pnpm db:generate` and never hand-edit applied migrations.
- User-facing strings live in one place per app (`apps/web/app/copy/`) so they can be translated later (PRD §3).

## Commands (all real as of M2-T21)

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` (CI: `pnpm install --frozen-lockfile`) |
| Local services | `docker compose up -d` (Postgres 18, Redis, Mailpit) |
| Dev (web :5173, api :3000, worker) | `pnpm dev` |
| Lint + format check / autofix | `pnpm lint` / `pnpm format` |
| Typecheck | `pnpm typecheck` |
| Unit + contract + component tests | `pnpm test:unit` |
| API integration tests (Testcontainers; needs Docker) | `pnpm test:integration` |
| E2E + axe (Playwright; needs `pnpm dev` stack) | `pnpm test:e2e` |
| Build (both apps + OpenAPI spec) | `pnpm build` |
| DB: generate migration / migrate / drift check | `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:check` |
| DB: drop, migrate, seed sample data | `pnpm db:reset` |
| DB: seed sample data only | `pnpm db:seed` |
| First Admin (server, one-time; password read from stdin) | `pnpm --filter api seed:admin -- --email … --username …` |
| **Everything CI runs except e2e** | **`pnpm check`** (lint, typecheck, db:check, test:unit, test:integration, build, openapi drift, audit) |

## Coding conventions

- TypeScript `strict: true` everywhere (plus `noUncheckedIndexedAccess`). No `any` without a comment explaining why.
- Validate every boundary with Zod: request body, query, params, env vars, Source responses, and API responses (serialize through response schemas so internal fields can't leak).
- API errors use Problem Details (RFC 9457): `{ type, title, status, detail, errors?: [{ path, message }] }`. Use the shared error helper and never send ad-hoc shapes.
- Permission checks go in Fastify `preHandler` hooks (`requirePermission('reviews.moderate')`), never inside route handlers. Check permissions, never role names.
- Every elevated action (Moderator or Admin) writes an `audit_log` row in the same transaction.
- A change to review status updates the Book's cached aggregates in the same transaction.
- DB access goes only through Drizzle with parameters. Never build SQL from strings.
- Migrations must stay compatible with the previous code version: expand, then contract. Add nullable columns or defaults first, and drop in a later task.
- IDs are UUIDv7. Timestamps are `timestamptz` UTC. Every FK is indexed. Only accounts are soft-deleted.
- `dangerouslySetInnerHTML` is banned (a Biome rule enforces it). Review text is plain text; links are not clickable.
- First page load uses route loaders. TanStack Query is only for client-side updates after load. Forms use React Hook Form with the shared Zod schemas.
- Pin major versions (`^x` within the PRD §8 stack table). Node 24, TypeScript 7 (`typescript@6` only for tools that need the old API).
- Code must run locally without external accounts: Docker Postgres and Redis, Mailpit for email, recorded Open Library fixtures (`SOURCE_MODE=fixtures`), local disk instead of R2, and Sentry disabled when there is no DSN.
- Stop every process you start (`pnpm dev`, API, worker, web servers) before you finish. Before running e2e, check that ports 5173 and 3000 are free (`lsof -nP -iTCP:5173 -iTCP:3000 -sTCP:LISTEN`); a leftover server from an earlier session gets reused by Playwright and breaks the specs.

## Definition of done (every task)

1. Tests at the layer PRD §12 assigns: unit for domain logic, contract for adapters, integration for **every endpoint (at least one allowed and one denied case)**, component for interactive UI, and Playwright + axe for the PRD §12 e2e flows.
2. `pnpm check` passes locally, and CI is green on the PR.
3. The task's `Accept:` bullets are each proven by running something.
4. Docs and `.env.example` are updated if behavior or configuration changed; add a `docs/DECISIONS.md` entry for any implementation choice the PRD left open.

## Never

- Edit `PRD.md`. Propose changes as a `docs/DECISIONS.md` entry instead.
- Commit secrets or `.env` files, or read `.env` files.
- Force-push, push to `main`, or rewrite published history.
- Weaken, skip, or delete tests, lint rules, or type checks to get green. No `--no-verify`, `.skip`, or `@ts-ignore` shortcuts.
- Add a dependency outside the PRD §8 stack table without a `docs/DECISIONS.md` entry saying why.
- Make a product decision the PRD doesn't settle. Record it as a blocker instead.
- Touch staging or production infrastructure or data.

## Loop workflow

Work is driven by the build loop (`scripts/ralph/`). Each iteration follows `scripts/ralph/PROMPT.md`: pick the first eligible `[ ]` task in `docs/TASKS.md`, read its brief in `docs/milestones/` and the cited PRD sections, build it on a `loop/<task-id>-<slug>` branch, and ship it as one squash-merged PR. Log it in `docs/PROGRESS.md`; record blockers in `docs/BLOCKERS.md` and decisions in `docs/DECISIONS.md`. UI work follows `docs/DESIGN.md`.
