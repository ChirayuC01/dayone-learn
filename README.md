# DayOne Learn

A gamified, multi-course daily learning platform. Each course is written day by day in Notion, and a scheduled Claude job pushes each new lesson and quiz into this app through the ingest API (see `NEW_COURSE_PLAYBOOK.md`).

Stack: Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 · PostgreSQL + Prisma 6 · Auth.js v5 · Zod · Vitest · Playwright.

## Local setup

Requires Node ≥ 22.18 for local development (the seed script runs TypeScript directly with Node's built-in type stripping) and PostgreSQL 14+.

```bash
cp .env.example .env            # then edit DATABASE_URL if needed
npm install
npx prisma migrate dev          # create tables
npm run db:seed                 # load reference/seed/* (idempotent; safe to re-run)
npm run dev                     # http://localhost:3000
```

Set `AUTH_SECRET` in `.env` (`npx auth secret` or `openssl rand -base64 32`). With no `RESEND_API_KEY` in development, the email sign-in link is printed in the `npm run dev` console, so you can sign in with any address and no other setup.

### Sign-in providers

| Provider | Env vars | Callback URL to register |
|---|---|---|
| Email magic link (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` (a verified Resend sender) | — |
| GitHub | `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | `<APP_URL>/api/auth/callback/github` |
| Google | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | `<APP_URL>/api/auth/callback/google` |

GitHub and Google buttons appear only when their env vars are set. Sessions are stored in the database. Emails listed in `ADMIN_EMAILS` get the ADMIN role when they sign in. Set `AUTH_TRUST_HOST=true` behind a proxy (Azure App Service).

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `typecheck` · `test` | ESLint · `tsc --noEmit` · Vitest |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` (production) |
| `npm run db:seed [slug]` | Load `reference/seed/<slug>/` (all courses if omitted) |
| `npm run db:reset` | Drop and recreate the database (then run `db:seed`) |

## Layout

```
app/                  Next.js routes (React Server Components by default)
lib/                  business rules as pure, unit-tested functions, plus DB services
  ingest/             schema.ts (Zod) · normalize.ts (pure rules) · service.ts (transactional upserts)
  content/            outline.ts (titles, tracks, syllabus states) · theme.ts (per-course accent) · queries.ts
  markdown/           remark-details.ts (the only raw HTML allowed in lessons: <details>/<summary>)
  time/               zoned.ts: calendar dates in IANA zones (DST-safe), wall-clock ↔ instant
  learning/           unlock.ts (daily/self pace), access.ts (who can open what), enrollment.ts, learner.ts
  quiz/               grade.ts (grader), progress.ts (best scores, module pass), service.ts (submit + persist)
  users/              display names
auth.ts               Auth.js v5 config (Prisma adapter, database sessions)
components/           Markdown renderer, reader sidebar/drawer, track toggle, cards
prisma/               schema.prisma and migrations
scripts/seed.ts       loads reference/seed/ through lib/ingest/service.ts (the same code the API uses)
reference/            prototype.html (design system source) and seed content
```

Code under `lib/` that scripts import uses relative imports with explicit `.ts` extensions and receives its Prisma client as an argument, so plain Node can run it without a bundler.

## Pages (so far)

| Route | What it shows |
|---|---|
| `/` | Landing: catalogue and how it works (signed-in users go to `/dashboard`) |
| `/signin` | GitHub / Google / email magic link |
| `/dashboard` | Continue cards for each enrolled course (gamification arrives in phase 5) |
| `/courses` | Catalogue cards (accent, icon, days published, learners) |
| `/courses/[slug]` | Overview, track picker, syllabus by module (published / upcoming) |
| `/learn/[slug]/day/[nn]` | Lesson reader with sidebar, track toggle, module-test card on review days, pager |
| `/learn/[slug]/module/[n]` | Module test (pass mark 70 %) |
| `POST /api/attempts` | Submit a lesson quiz or module test for grading |

Lesson Markdown is rendered on the server with GFM and `rehype-sanitize`. ` ```bash ` blocks get a `$` prompt per command line and a copy button, ` ```output ` blocks a dashed box, and any other fence a diagram box. Raw HTML is dropped except `<details>`/`<summary>`. An enrolled learner's track is stored on their enrollment; everyone else's in a per-course cookie.

## Unlocking

- **Daily pace** (default): Day 1 opens on enrollment, then one more day at each midnight in the learner's time zone, capped at the latest published day. Day maths is done on calendar dates, so DST changes never skip or repeat a day.
- **Self-paced**: every published lesson is open.
- Switching pace never re-locks an open day: switching to daily re-anchors at today with everything currently open.
- Not enrolled (or signed out): Day 01 is a free preview; other days and module tests ask you to enroll. Locked content never reaches the browser.
- A module test opens with its module's review day.
- A caught-up learner sees when the next lesson arrives: the course's ingest time (`ingestTime` in `ingestTimezone`) shown in their own zone.

## Quizzes

Questions reach the browser without answers or explanations; `POST /api/attempts` grades on the server and only then returns the right answer and explanation for each question.

- Questions are filtered by the enrollment's track (an empty `tracks` list means every track).
- Typed answers (`CMD`, `TEXT_EXACT`) are trimmed, lose a leading `$ ` (commands only) and trailing `;`, and have whitespace collapsed, then are compared with the normalised `accept` list, case-sensitively unless the question sets `caseSensitive: false`. A case-only miss shows the course's `caseMissMessage`.
- Each attempt is stored in `Attempt`; `LessonProgress` / `ModuleProgress` keep the best score (compared as a ratio), attempt count, first perfect time and, for module tests, the first pass (≥ 70 %).
- The server checks enrollment and unlock state for every submission and allows 6 attempts per user per minute.

## Seed data format

`reference/seed/<slug>/course.json` is the body of `PUT /api/ingest/courses/<slug>`, `day-NN.json` the body of `PUT …/lessons/NN`, and `module-N.json` the body of `PUT …/modules/N`. Presentation fields the export doesn't carry (accent, icon, description, status) are filled from `COURSE_DEFAULTS` in `scripts/seed.ts`.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests and a production build on Node 20. A second job applies the migrations to Postgres 16, checks that `schema.prisma` and the migrations are in sync, and runs the seed twice to prove it's idempotent.
