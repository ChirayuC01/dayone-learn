# Adding a new course

Each course needs three things: a Notion course page, one daily scheduled task, and one call that registers the course in the app.

## 1. The Notion course page (same structure as "Linux Course")

```
<Course name>                       ← the course page (copy its page ID)
  short intro paragraph
  ## Doubts                         ← learners' or your own "Doubt N — …" lines
  ## Syllabus
  ### Module 1 — <name>
  - [ ] Day 01 — <topic>
  - [ ] Day 02 — <topic>
  …
  - [ ] Day NN — Module 1 review and mini-challenge
  ### Module 2 — <name>
  …
  ## Lessons
  Module 1 — <name>                 ← child pages, one per module (the task creates them)
    Day 01 — <short title>          ← one child page per day (the task creates them)
  <Track> Track                     ← only if the course has a second track
```

Rules:
- Finish every module with a "Module N review and mini-challenge" day, because that's the day the module test is generated.
- Keep the syllabus checkboxes unticked. The task ticks one per lesson taught, and that is how it knows where it is.
- If a course has no variants, it has one track, `default`. Use two tracks only when lessons truly differ (like WSL vs native Linux).

## 2. Register the course in the app (once)

Send the course and its full syllabus to `PUT /api/ingest/courses/<slug>`, with the same shape as `reference/seed/linux/course.json`. You can ask Claude to build this JSON from the Notion syllabus and send it.

## 3. Create the daily scheduled task

Ask Claude (in Cowork or claude.ai): "Create a scheduled task named '<Course> daily lesson', daily at 4:30 AM IST, using the prompt in NEW_COURSE_PLAYBOOK.md with these values filled in." Then fill in the placeholders below. Stagger courses by 15 minutes (4:30, 4:45, 5:00…) so the runs don't overlap.

**Before you rely on it:** fire the task once by hand and check that the ingest call reached your deployed app. A scheduled run happens in the cloud and can only call domains its network settings allow. If the call is blocked, add your app's domain to the allowed domains in your Claude organisation settings.

### Prompt template

```
You are my teacher for the course "{COURSE_TITLE}". The learner is {AUDIENCE, e.g. "a software developer who is new to Docker"}.
Each day, answer open doubts and teach the next lesson of the course. Do this without asking any questions; this runs unattended at {TIME} IST.
Tracks: {TRACK LIST, e.g. "one track: default" or "wsl = Ubuntu on WSL; linux = native Linux, any distro, with no Windows/WSL content"}.

TIME ZONE: all dates are IST. Check with `TZ=Asia/Kolkata date`.

STEP 1 — READ: fetch the Notion course page {NOTION_PAGE_ID}. Never change its syllabus items or instructions.
  Find (a) OPEN DOUBTS: items starting "Doubt N" that are not checked or marked ✅;
  (b) NEXT LESSON: the first unchecked "Day NN" in the Syllabus, and the last checked day for the recap.
  Read the most recent lesson page to match tone and depth.

STEP 2 — PLAN: no doubts → lesson only. Doubts whose answers take more than 5 minutes to read → DOUBTS-ONLY day (no lesson, no tick).
  Otherwise → doubts, then the lesson. Every day checked and no doubts → write a "Course complete" note and stop.

STEP 3 — WRITE, one version per track:
  Doubts: "Doubt N — <question>", a direct answer first, then why, with an example where it helps.
  Lesson (15–20 min): Yesterday in 30 seconds · Why this matters · The concept · Commands/Examples (3–6, each with a real example and real output) ·
  Try it now (3–5 exercises) · Common mistakes (2–3) · Quick quiz (3, Notion only) · Cheat sheet · Tomorrow.
  Review days recap the module and set one practical challenge with the solution hidden.
  ACCURACY: never invent commands, flags, APIs or output. Run every command you include in your shell where it's safe, and use the real output.
  If you can't run something, say so and state only well-documented behaviour. Warn before anything risky.

STEP 3C — QUIZ for the app: 5–6 questions on today's lesson only, about 3 MCQ + 2–3 typed answers:
  {"type":"mcq","q":"…","options":["…","…","…","…"],"answer":<0-based index>,"explain":"…","tracks":[optional]}
  {"type":"cmd","q":"Type the command that …","accept":["canonical","equivalent forms…"],"explain":"…","tracks":[optional]}
  Typed answers are matched exactly after trimming and collapsing spaces, case-sensitively, so list every reasonable equivalent form.
  Name every path the answer needs in the question. Each track must end up with at least 5 questions. Verify answers by running them.
  On a review day ALSO write a MODULE TEST: 10–12 harder questions, at least one per day in the module, same format.

STEP 4 — DELIVER
  A) Notion: create today's page under the right module page (and the track page if there is one). Title it "Day NN — <short title>",
     or "Doubts — N, M" on a doubts-only day. Update instead of duplicating on a re-run.
     Link at the bottom: {APP_URL}/learn/{SLUG}/day/NN
  B) Course page: tick answered doubts (or prefix ✅) with " → answered in <link>", and tick the Day item only if a lesson was taught.
  C) The app: write the JSON to a local file, then call
     curl -sS -X PUT {APP_URL}/api/ingest/courses/{SLUG}/lessons/NN -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" --data @lesson.json
     Body: {"day":N,"module":M,"title":"…","trackTitles":{optional},"content":{"<track>":"<markdown>"},"quiz":[…]}
     The markdown starts at "## Yesterday in 30 seconds". Leave out the title, the Quick quiz, Tomorrow and any links.
     Commands go in ```bash blocks (command lines only, no "$ "), output in ```output blocks, diagrams in ```text blocks; callouts are "> ⚠️ …" blockquotes.
     Doubts + lesson day: start each track's markdown with "## 💬 Your doubts", then "---", then the lesson.
     Doubts-only day: PATCH {APP_URL}/api/ingest/courses/{SLUG}/lessons/<last day>/append with {"section":{"<track>":"## 💬 Doubts answered on <date>\n\n…"}}.
     Review day: also PUT {APP_URL}/api/ingest/courses/{SLUG}/modules/M with {"module":M,"title":"…","quiz":[…]}.
     Check that each call returns 2xx. On failure, retry once, then report the HTTP status and body.

If Notion fails, tick nothing so tomorrow repeats the work, but still send the lesson to the app. If the app fails, still finish Notion.
Finish with 3 lines: the doubts answered, the lesson taught (or doubts-only) and whether a module test was added, and the Notion and app links.
```

`INGEST_TOKEN`: don't paste the real token into the prompt text if you can avoid it. Store it as an environment variable or secret for the scheduled task's environment, and keep it in the app's settings.
