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
| `npm run db:seed [slug]` | Load `reference/seed/<slug>/` (all courses if omitted); `-- --achievements` seeds only the achievement catalogue |
| `npm run test:e2e` | Playwright end-to-end suite (see below) |
| `npm run db:reset` | Drop and recreate the database (then run `db:seed`) |

## Layout

```
app/                  Next.js routes (React Server Components by default)
lib/                  business rules as pure, unit-tested functions, plus DB services
  ingest/             schema.ts (Zod) · normalize.ts (pure rules) · service.ts (transactional upserts) · http.ts (route plumbing)
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
  ratelimit/          limit.ts: Postgres fixed-window rate limiter shared by all instances
  users/              display names
auth.ts               Auth.js v5 config (Prisma adapter, database sessions)
components/           Markdown renderer, reader sidebar/drawer, track toggle, cards
prisma/               schema.prisma and migrations
scripts/seed.ts       loads reference/seed/ through lib/ingest/service.ts (the same code the API uses)
reference/            prototype.html (design system source) and seed content
```

Code under `lib/` that scripts import uses relative imports with explicit `.ts` extensions and receives its Prisma client as an argument, so plain Node can run it without a bundler.

## Pages

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
| `/api/ingest/…` | Content ingest API for the scheduled Claude jobs (see [docs/INGEST.md](docs/INGEST.md)) |
| `/admin` | ADMIN only: course status, ingest log, lesson previews per track, re-publish a day, hide questions |

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

## Content ingest and admin

- The ingest API (`PUT /api/ingest/courses/{slug}`, `…/lessons/{day}`, `PATCH …/lessons/{day}/append`, `PUT …/modules/{n}`, `GET /api/ingest/health`) is documented with curl examples in [docs/INGEST.md](docs/INGEST.md). Every call needs `Authorization: Bearer $INGEST_TOKEN`, is validated with Zod, runs in a transaction, is idempotent and is written to the ingest log.
- `/admin` is for users with the ADMIN role (emails in `ADMIN_EMAILS`); everyone else gets a 404. It lists courses with a DRAFT / LIVE / ARCHIVED switch, the ingest log (filter by course and status), and per course every published day with previews per track (DRAFT courses too), each quiz with its answers and a hide / show switch per question, and a **Re-publish** button that resets a day's publish time to now and logs it.

## Rate limits

Shared by every app instance through the `RateLimit` table (one atomic upsert per request; old windows are pruned by the hourly cron).

| What | Limit |
|---|---|
| Ingest API | 120 / minute |
| Email sign-in links | 5 per address and 20 per IP / 15 minutes |
| Quiz and module test submissions | 6 per user / minute |
| Reading heartbeats | 40 per user / minute |
| Cron routes | 30 per route / minute |

## Seed data format

`reference/seed/<slug>/course.json` is the body of `PUT /api/ingest/courses/<slug>`, `day-NN.json` the body of `PUT …/lessons/NN`, and `module-N.json` the body of `PUT …/modules/N`. Presentation fields the export doesn't carry (accent, icon, description, status) are filled from `COURSE_DEFAULTS` in `scripts/seed.ts`.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests and a production build on Node 20. A second job applies the migrations to Postgres 16, checks that `schema.prisma` and the migrations are in sync, and runs the seed twice to prove it's idempotent.

## End-to-end tests

`e2e/learner-journey.spec.ts` walks the main loop on a production build:

1. Sign in with the **test provider**: an email-link provider that exists only when `AUTH_TEST_PROVIDER=1` and keeps the link in memory instead of emailing it (`/api/test/magic-link` returns it; both 404 otherwise). It uses the real Auth.js verification-token and database-session flow. **Never set `AUTH_TEST_PROVIDER` in a real deployment.**
2. Enroll in Linux on the WSL track at daily pace.
3. Read Day 01 for real (end of the lesson, one minute, heartbeats) and take its quiz with every answer right.
4. On the dashboard: 35 XP (10 reading + 20 quiz + 5 daily goal), a 1-day streak and the First Lesson achievement.
5. Ingest Day 08 with `curl` through `PUT /api/ingest/courses/linux/lessons/8` (`e2e/fixtures/day-08.json`).
6. Day 08 is locked on daily pace; after switching to self-paced it opens with its 6-question quiz.

```bash
createdb dayone_e2e            # once; or let `prisma migrate deploy` create it
npm run test:e2e               # builds, starts on :3100, migrates + empties + seeds dayone_e2e, runs the test
```

The suite uses its own database (`E2E_DATABASE_URL`, default `postgresql://dayone:dayone@localhost:5432/dayone_e2e`); setup refuses any database whose name doesn't contain `e2e` or `test`, because it empties every table. It takes about two minutes, most of it the build and the one-minute read. CI runs it in the `e2e` job; to use a preinstalled Chromium set `PW_CHROMIUM_PATH`.

## Deploying to Azure

The app is a standard Next.js server (`output: "standalone"`) plus PostgreSQL, so it runs on Azure App Service (Linux) with Azure Database for PostgreSQL, and also on Vercel or any Node host.

> **Node version:** Node 20 reached end of life in April 2026. Use the **Node 22 LTS** runtime stack on App Service (CI also builds on Node 20 to check compatibility). The seed and e2e setup need Node ≥ 22.18.

### 1. Create the resources

```bash
RG=dayone; LOC=centralindia; APP=dayone-learn; PG=dayone-pg
az group create -n $RG -l $LOC

# PostgreSQL Flexible Server (Burstable B1ms is enough to start)
az postgres flexible-server create -g $RG -n $PG -l $LOC --tier Burstable --sku-name Standard_B1ms \
  --version 16 --admin-user dayone --admin-password '<strong password>' --public-access 0.0.0.0
az postgres flexible-server db create -g $RG -s $PG -d dayone
# --public-access 0.0.0.0 allows other Azure services (the web app). Add your own IP to run migrations from your machine:
az postgres flexible-server firewall-rule create -g $RG -n $PG -r me --start-ip-address <your-ip> --end-ip-address <your-ip>

# App Service (Linux, Node 22)
az appservice plan create -g $RG -n $APP-plan --is-linux --sku B1
az webapp create -g $RG -p $APP-plan -n $APP --runtime "NODE:22-lts"
az webapp config set -g $RG -n $APP --startup-file "HOSTNAME=0.0.0.0 node server.js"
```

App Service sets `PORT`; `HOSTNAME=0.0.0.0` matters because App Service also sets `HOSTNAME` to the container's name, which would make the Next.js server listen on the wrong interface.

### 2. App settings

Set these under **Configuration → Application settings** (or `az webapp config appsettings set -g $RG -n $APP --settings KEY=value …`):

| Setting | Value |
|---|---|
| `DATABASE_URL` | `postgresql://dayone:<password>@<server>.postgres.database.azure.com:5432/dayone?sslmode=require` |
| `APP_URL` | `https://<app>.azurewebsites.net` (or your custom domain) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional; callback URLs `<APP_URL>/api/auth/callback/github` and `…/google` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend key and a sender on a domain verified in Resend |
| `ADMIN_EMAILS` | your email |
| `INGEST_TOKEN` | a long random string; the same value goes into each scheduled Claude job's environment |
| `CRON_SECRET` | a long random string; the same value goes into the cron caller |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (the package is already built) |

Do **not** set `AUTH_TEST_PROVIDER`.

### 3. Deploy

`.github/workflows/deploy-azure.yml` (run it from the Actions tab) installs, applies migrations, seeds the achievement catalogue, builds, assembles `.next/standalone` with the static files (without any `.env`), and deploys it with the publish profile. It needs:

- secret `AZURE_WEBAPP_PUBLISH_PROFILE`: the web app's publish profile (`az webapp deployment list-publishing-profiles -g $RG -n $APP --xml`, or Overview → Download publish profile; basic-auth publishing must be enabled),
- secret `DATABASE_URL_MIGRATE`: a connection string the GitHub runner can reach (open the server's firewall to it, or skip that step and run `npx prisma migrate deploy` yourself with your IP allowed),
- variable `AZURE_WEBAPP_NAME`.

By hand, the same steps are:

```bash
npm ci
DATABASE_URL="<direct url>" npx prisma migrate deploy
DATABASE_URL="<direct url>" node scripts/seed.ts --achievements
npm run build
cp -r .next/static .next/standalone/.next/static && rm -f .next/standalone/.env*
cd .next/standalone && zip -qr ../../deploy.zip . && cd ../..
az webapp deploy -g $RG -n $APP --src-path deploy.zip --type zip
```

Then register the Linux course (`PUT /api/ingest/courses/linux` with `reference/seed/linux/course.json`) and let the scheduled job publish lessons, or load the reference lessons once with `DATABASE_URL=<url> npm run db:seed linux`. Set the course LIVE in `/admin`.

### 4. Scheduled jobs

Two idempotent routes need calling (see [Leagues, reminders and cron jobs](#leagues-reminders-and-cron-jobs)):

- **GitHub Actions** (already in the repo): `.github/workflows/cron.yml`. Add repository secrets `APP_URL` and `CRON_SECRET`.
- **Azure Functions** timer instead (NCRONTAB has seconds and runs in UTC):

  ```js
  // Node.js v4 programming model
  const { app } = require("@azure/functions");
  const call = (job) => fetch(`${process.env.APP_URL}/api/cron/${job}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  app.timer("weeklyLeague", { schedule: "0 30 18 * * 0", handler: () => call("weekly-league") }); // Mon 00:00 IST
  app.timer("reminders", { schedule: "0 7 * * * *", handler: () => call("reminders") });         // hourly
  ```

### 5. Checks after deploying

- `curl -H "Authorization: Bearer $INGEST_TOKEN" $APP_URL/api/ingest/health` lists the courses.
- Health check path for App Service: `/courses` (renders from the database; no auth needed).
- Sign in, then `/admin` (with your email in `ADMIN_EMAILS`) shows the ingest log.
- Fire each scheduled Claude job once and confirm its row in the ingest log. A Claude job can only call domains its network settings allow, so add the app's domain there (see `NEW_COURSE_PLAYBOOK.md`).

### Scaling and other hosts

- Everything that must be shared lives in PostgreSQL: sessions, rate limits, league placement (advisory lock) and email bookkeeping, so you can scale out to several instances.
- **Connection poolers** (PgBouncer, Neon's `-pooler` host, Azure's built-in PgBouncer on port 6432): add `pgbouncer=true` to the app's `DATABASE_URL` and run migrations with a direct (non-pooled) URL.
- **Vercel**: works as is (`output: "standalone"` is ignored there). Set the same environment variables, and schedule the cron routes with Vercel Cron; it sends `GET` with `Authorization: Bearer $CRON_SECRET`, which the routes accept.

