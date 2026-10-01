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
  gamification/       xp.ts · levels.ts · streak.ts · goal.ts · achievements.ts + catalog.ts · reading.ts ·
                      heatmap.ts (all pure) · service.ts (recordActivity) · dashboard.ts
  review/             leitner.ts (boxes, due dates, session picking; pure) · service.ts (queue + sessions)
  league/             league.ts (weeks, cohorts, zones; pure) · service.ts (finalise, place, standings, all-time board)
  notify/             reminders.ts + unsubscribe.ts (pure) · emails.ts (templates) · service.ts (send reminders/summaries)
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
| `/dashboard` | Goal ring, streak and freezes, level ring, Continue cards with course progress, achievements, activity heatmap |
| `/courses` | Catalogue cards (accent, icon, days published, learners) |
| `/courses/[slug]` | Overview, track picker, syllabus by module (published / upcoming) |
| `/learn/[slug]/day/[nn]` | Lesson reader with sidebar, track toggle, module-test card on review days, pager |
| `/learn/[slug]/module/[n]` | Module test (pass mark 70 %) |
| `POST /api/attempts` | Submit a lesson quiz or module test for grading (returns XP and other rewards) |
| `POST /api/reading` | Reading heartbeat: `start`, `beat`, `finish` |
| `/review` | Spaced-repetition session: up to 5 due questions mixed from all enrolled courses |
| `POST /api/review` | Grade a review session |
| `/leaderboard` | This week's league (your cohort, zones, XP to promotion) and the opt-in all-time XP board |
| `/profile/[displayName]` | Level, streak, league tier, courses and trophy case (public only if the learner allows it) |
| `/settings` | Display name, time zone, daily goal, reminder, weekly summary, league / board / profile privacy, sign out, delete account |
| `/unsubscribe` | One-click email unsubscribe from a signed link (with a confirm button) |
| `POST /api/cron/weekly-league` | Monday job: finalise last week, place this week, send weekly summaries |
| `POST /api/cron/reminders` | Hourly job: streak reminder emails |

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

## Gamification

All rules are pure functions in `lib/gamification/` with unit tests; `recordActivity` applies them in one transaction per user (it locks the user's `Streak` row so concurrent actions can't double-count).

| Event | XP |
|---|---|
| Finish reading a lesson (end of the lesson seen, ≥ 60 s on the page, ≥ 3 heartbeats) | 10, once per lesson |
| Lesson quiz, first attempt | 2 per correct answer, +10 if perfect |
| Retake that beats the best score | 1 per newly correct answer, for at most 3 rewarded retakes a day |
| Module test passed (≥ 70 %) | 50 once; perfect +25 once |
| Review session of 5 due questions | 5, for at most 4 sessions a day |
| Daily goal hit | +5 |
| Streak of 7 / 30 / 100 days | +25 / +100 / +300, once each |
| Course completed (every day read, every module test passed) | +200 |

- **Ledger:** every award is an `XpEvent` with a unique `refKey` (e.g. `quiz-first:{userId}:{lessonId}`), inserted with `skipDuplicates`, so repeating an action never pays twice. Totals are always summed from the ledger.
- **Levels:** `xpForLevel(n) = 50·n·(n+1)/2` is the total XP to go from level n to n+1 (level 2 at 50 XP, 3 at 150, 4 at 300).
- **Streak:** global across courses. A day counts when the learner earns XP from a lesson, quiz or review in their own time zone. One freeze to start, one more every 7 streak days (max 2); freezes cover missed days automatically on the next active day.
- **Daily goal:** 10 / 30 / 50 / 100 XP (default 30), changed from the dashboard.
- **Achievements:** rows in the `Achievement` table with a `criteria` object (`{"type":"streak","gte":7}`, `{"type":"lessonAtHour","from":22,"to":24}`, …). Add rows with any type from `lib/gamification/achievements.ts` and they are evaluated after every XP-earning action and on enrolment. The seed loads the 12 in `catalog.ts`.
- **Celebrations:** toasts for XP, level-ups, streaks, goals, achievements and course completion; confetti for the big ones, skipped under `prefers-reduced-motion`.

## Review (spaced repetition)

- Every question answered wrong in a lesson quiz or module test enters a Leitner queue in box 1 (or goes back to box 1).
- A question in box 1–5 is due 1 / 2 / 4 / 8 / 16 days after it was last answered, at local midnight in the learner's zone.
- `/review` serves up to 5 due questions, most overdue first, taking courses in turn so a session mixes them. Only active enrollments, the learner's track and non-hidden questions count.
- Correct moves a question up a box (box 5 stays at 5); wrong sends it back to box 1.
- `POST /api/review` grades on the server and only accepts questions that are due right now, so a replayed submission is rejected (409). Each session is stored as a `REVIEW` attempt; its answers count towards the Reviewer achievement.

## Leagues, reminders and cron jobs

- **Weeks** run from Monday 00:00 IST. Active learners (XP in the last 14 days) who haven't opted out are placed in cohorts of up to 30 within their tier (Bronze → Silver → Gold → Sapphire → Diamond), ranked by XP earned that week.
- At the end of the week the top 5 move up and the bottom 5 move down (no demotion from Bronze, no promotion from Diamond). Small cohorts use smaller zones (a third each) so they never overlap, and nobody is promoted with 0 XP.
- A learner who becomes active mid-week joins a cohort the first time they open the dashboard or leaderboard (same placement code as the Monday job).
- **Reminders:** opt-in, sent once a day in the two hours after the learner's chosen local time, only if they haven't learned yet that day. **Weekly summary:** opt-in, sent by the Monday job. Both go through Resend with a signed unsubscribe link and a `List-Unsubscribe` header.
- **Cron routes** require `Authorization: Bearer $CRON_SECRET` (constant-time compare) and are idempotent: finished weeks, placed users and sent emails are recorded and skipped on a re-run; placement takes a Postgres advisory lock.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/weekly-league"   # Mondays 00:00 IST (Sun 18:30 UTC)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/reminders"       # hourly
```

`.github/workflows/cron.yml` calls both on schedule (set repository secrets `APP_URL` and `CRON_SECRET`; run either by hand from the Actions tab). An Azure Functions timer can call the same URLs instead.

### Running SQL by hand (Windows)

Windows PowerShell strips the double quotes Prisma's table names need when it passes a command to `psql`. Use Prisma, which reads `DATABASE_URL` from `.env` and works in every shell:

```powershell
'update "ReviewItem" set "dueAt" = now();' | npx prisma db execute --stdin --schema prisma/schema.prisma
```

## Seed data format

`reference/seed/<slug>/course.json` is the body of `PUT /api/ingest/courses/<slug>`, `day-NN.json` the body of `PUT …/lessons/NN`, and `module-N.json` the body of `PUT …/modules/N`. Presentation fields the export doesn't carry (accent, icon, description, status) are filled from `COURSE_DEFAULTS` in `scripts/seed.ts`.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests and a production build on Node 20. A second job applies the migrations to Postgres 16, checks that `schema.prisma` and the migrations are in sync, and runs the seed twice to prove it's idempotent.
