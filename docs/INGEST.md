# Content ingest API

Each course has one scheduled Claude job (see `NEW_COURSE_PLAYBOOK.md`) that writes the day's lesson in Notion and then pushes it into the app through this API. Every route:

- requires `Authorization: Bearer $INGEST_TOKEN` (compared in constant time; set `INGEST_TOKEN` in the app's environment and in the job's environment),
- validates the JSON body with Zod (unknown keys are ignored), max 1 MB,
- writes in one transaction and is **idempotent**: sending the same body twice leaves the same data,
- writes an `IngestLog` row, success or failure (see `/admin/ingest`),
- is rate-limited to 120 requests a minute.

Responses are JSON. Success: `{"ok": true, "message": "…", …}` with status 200 (201 when something was created). Failure: `{"ok": false, "error": "…", "issues": ["path: problem", …]}` with:

| Status | Meaning |
|---|---|
| 400 | Body isn't JSON or doesn't match the schema; `issues` lists each field |
| 401 | Missing or wrong token |
| 404 | Course (or lesson, for `append`) doesn't exist yet |
| 409 | A course update would move or drop a published lesson, or remove a track that learners use |
| 413 | Body over 1 MB |
| 422 | Valid shape but breaks a rule (day not in the syllabus, unknown track, fewer than 5 questions on a track…) |
| 429 | Rate limit; retry after the `Retry-After` seconds |
| 503 | `INGEST_TOKEN` isn't configured on the server |

The examples use bash. Set these first:

```bash
export APP_URL="https://learn.example.com"   # or http://localhost:3000
export INGEST_TOKEN="…"
```

In Windows PowerShell use `curl.exe` (not `curl`), `$env:INGEST_TOKEN`, and keep request bodies in files (`--data "@lesson.json"`), which avoids PowerShell's quoting problems.

---

## `GET /api/ingest/health`

Checks the token and returns every course with its latest published day.

```bash
curl -sS "$APP_URL/api/ingest/health" -H "Authorization: Bearer $INGEST_TOKEN"
```

```json
{ "ok": true, "time": "2026-10-01T23:00:04.120Z",
  "courses": [{ "slug": "linux", "status": "LIVE", "totalDays": 66, "published": 7, "latestDay": 7, "lastIngestAt": "2026-10-01T23:00:02.900Z" }] }
```

## `PUT /api/ingest/courses/{slug}`

Creates or updates a course and its **full syllabus** (every module and day, published or not). The body is the shape of `reference/seed/linux/course.json`.

```bash
curl -sS -X PUT "$APP_URL/api/ingest/courses/docker" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  --data @course.json
```

```jsonc
{
  "slug": "docker",                       // optional; must match the URL
  "title": "Docker Basics",
  "tagline": "Containers one lesson a day.",          // optional
  "description": "…",                                  // optional
  "accent": "#3b82f6",                                 // optional, #rrggbb (default #f0b44c)
  "icon": "🐳",                                        // optional, up to 8 characters (default "$_")
  "status": "DRAFT",                                   // optional: DRAFT | LIVE | ARCHIVED. New courses default to DRAFT; omitted on update = unchanged
  "tracks": [{ "key": "default", "label": "Default" }],
  "defaultTrack": "default",
  "totalDays": 40,
  "caseMissMessage": "Close: Docker commands are case-sensitive.",  // optional
  "ingestTime": "04:45", "ingestTimezone": "Asia/Kolkata",          // optional: when new lessons usually arrive (shown to learners)
  "notionPageId": "…",                                              // optional
  "modules": [
    { "number": 1, "title": "Getting Started", "days": [ { "day": 1, "title": "What a container is" }, { "day": 2, "title": "…" } ] }
  ]
}
```

Rules: track keys are unique lowercase slugs; `defaultTrack` is one of them; module numbers are unique; each module's days are consecutive; the days cover `1..totalDays` exactly once. An update never deletes published lessons: if the new syllabus would drop or move a published day to another module, or remove a track that has enrollments, the request fails with 409 and nothing changes.

`201 {"ok":true,"courseId":"…","created":true,"message":"created course docker: 6 modules, 40 days"}`

## `PUT /api/ingest/courses/{slug}/lessons/{day}`

Publishes a day (or updates it on a re-run) and **replaces its quiz**. The body is the shape of `reference/seed/linux/day-07.json`.

```bash
curl -sS -X PUT "$APP_URL/api/ingest/courses/linux/lessons/8" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  --data @lesson.json
```

```jsonc
{
  "day": 8,                 // must match the URL
  "module": 2,              // must match the syllabus
  "title": "Copying, moving, and renaming",
  "trackTitles": { "linux": "Copying and moving files" },   // optional, per-track titles
  "content": {              // one Markdown document per track; keys must be the course's tracks
    "wsl": "## Yesterday in 30 seconds\n…",
    "linux": "## Yesterday in 30 seconds\n…"
  },
  "quiz": [
    { "type": "mcq", "q": "What does `cp -r` do?", "options": ["…", "…", "…", "…"], "answer": 1, "explain": "…" },
    { "type": "cmd", "q": "Type the command that renames `a.txt` to `b.txt`.", "accept": ["mv a.txt b.txt"], "explain": "…" },
    { "type": "text", "q": "Which flag copies folders?", "accept": ["-r", "-R"], "caseSensitive": true, "explain": "…" },
    { "type": "mcq", "q": "…", "options": ["…", "…"], "answer": 0, "explain": "…", "tracks": ["wsl"] }
  ]
}
```

Questions: `mcq` (`options` 2–6, `answer` is the 0-based index), `cmd` (typed command; a leading `$ ` and trailing `;` are ignored), `text` (typed answer, `caseSensitive` defaults to true). `tracks` limits a question to some tracks; omit it for all. **Every track must end up with at least 5 questions**, or the request fails with 422.

Re-sending a day updates the lesson in place (its first publish time is kept) and updates questions by position, so learners' review history survives; extra old questions are removed. Questions an admin hid stay hidden.

`201 {"ok":true,"lessonId":"…","created":true,"message":"published linux day 8: wsl+linux, 6 questions"}` (200 and `"updated …"` on a re-run)

## `PATCH /api/ingest/courses/{slug}/lessons/{day}/append`

Appends a section to an existing lesson, for doubts-only days. Each track's text is added after a `---` rule.

```bash
curl -sS -X PATCH "$APP_URL/api/ingest/courses/linux/lessons/7/append" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  --data '{"section":{"wsl":"## 💬 Doubts answered on 2 Oct\n\n…","linux":"## 💬 Doubts answered on 2 Oct\n\n…"}}'
```

`200 {"ok":true,"lessonId":"…","message":"appended to linux day 7: wsl+linux"}`. Appending is not idempotent by nature: sending the same section twice adds it twice.

## `PUT /api/ingest/courses/{slug}/modules/{n}`

Creates or replaces a module test. The body is the shape of `reference/seed/linux/module-1.json`; questions use the format above.

```bash
curl -sS -X PUT "$APP_URL/api/ingest/courses/linux/modules/2" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  --data @module.json
```

```json
{ "module": 2, "title": "Files & Directories", "quiz": [ { "type": "mcq", "q": "…", "options": ["…", "…"], "answer": 0, "explain": "…" } ] }
```

The module test opens for a learner when the module's last (review) day unlocks. Pass mark: 70 %.

`200 {"ok":true,"moduleId":"…","message":"module 2 test for linux: 12 questions"}`

---

## Local seed

`npm run db:seed` loads `reference/seed/<slug>/` (`course.json`, `day-NN.json`, `module-N.json`) through the same service functions these routes call, so a file that seeds will also ingest.

## Troubleshooting

- **401** from a scheduled job: the job's `INGEST_TOKEN` differs from the app's.
- **404 course not found** on a lesson: register the course first with `PUT /api/ingest/courses/{slug}`.
- **422 … needs at least 5**: one track has too few questions after the `tracks` filter; add questions for that track or make some shared.
- Every request, failed or not, is listed in **Admin → Ingest log** with the error details.
