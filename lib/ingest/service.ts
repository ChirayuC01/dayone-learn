// Ingest service: idempotent, transactional upserts. Used by the ingest API routes and scripts/seed.ts.
// The Prisma client is passed in, so this module stays importable from plain Node scripts.
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  IngestError,
  appendSections,
  planSyllabus,
  prepareLesson,
  prepareQuestions,
  type QuestionData,
  type TrackDef,
} from "./normalize.ts";
import type { AppendInput, CourseInput, LessonInput, ModuleTestInput } from "./schema.ts";

type Tx = Prisma.TransactionClient;
type IngestKind = "COURSE" | "LESSON" | "APPEND" | "MODULE";

/** Runs an ingest operation and writes an IngestLog row whether it succeeds or fails. */
export async function withIngestLog<T extends { message: string }>(
  db: PrismaClient,
  meta: { courseSlug: string; kind: IngestKind; day?: number },
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    await db.ingestLog.create({ data: { ...meta, status: "OK", message: result.message } });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.ingestLog.create({ data: { ...meta, status: "ERROR", message: message.slice(0, 2000) } });
    throw err;
  }
}

async function getCourse(tx: Tx, slug: string) {
  const course = await tx.course.findUnique({ where: { slug } });
  if (!course) throw new IngestError(404, `course "${slug}" not found; PUT /api/ingest/courses/${slug} first`);
  return { ...course, trackKeys: (course.tracks as TrackDef[]).map((t) => t.key) };
}

/** Upserts questions by position so question ids (and review history) survive a re-ingest. */
async function replaceQuestions(
  tx: Tx,
  owner: { courseId: string } & ({ lessonId: string } | { moduleId: string }),
  questions: QuestionData[],
) {
  const where = "lessonId" in owner ? { lessonId: owner.lessonId } : { moduleId: owner.moduleId };
  for (const q of questions) {
    const unique =
      "lessonId" in owner
        ? { lessonId_order: { lessonId: owner.lessonId, order: q.order } }
        : { moduleId_order: { moduleId: owner.moduleId, order: q.order } };
    // `hidden` is admin-owned: set on create, never touched by a re-ingest.
    await tx.question.upsert({ where: unique, create: { ...owner, ...q }, update: q });
  }
  const removed = await tx.question.deleteMany({ where: { ...where, order: { gte: questions.length } } });
  return removed.count;
}

// ───────────── PUT /courses/[slug] ─────────────

export async function upsertCourse(db: PrismaClient, slug: string, input: CourseInput) {
  const plan = planSyllabus(input, slug);
  const trackKeys = input.tracks.map((t) => t.key);

  return db.$transaction(async (tx) => {
    const existing = await tx.course.findUnique({ where: { slug } });
    if (existing) {
      // Never delete or orphan published lessons.
      const lessons = await tx.lesson.findMany({
        where: { courseId: existing.id },
        select: { day: true, moduleNumber: true },
      });
      const planned = new Map(plan.days.map((d) => [d.day, d.moduleNumber]));
      const conflicts = lessons
        .filter((l) => planned.get(l.day) !== l.moduleNumber)
        .map((l) => `published day ${l.day} (module ${l.moduleNumber}) is missing from or moved in the new syllabus`);
      const usedTracks = await tx.enrollment.findMany({
        where: { courseId: existing.id, track: { notIn: trackKeys } },
        distinct: ["track"],
        select: { track: true },
      });
      conflicts.push(...usedTracks.map((e) => `track "${e.track}" still has enrollments`));
      if (conflicts.length) throw new IngestError(409, "syllabus conflicts with published content", conflicts);
    }

    const fields = {
      title: input.title,
      tagline: input.tagline,
      description: input.description,
      accent: input.accent,
      icon: input.icon,
      tracks: input.tracks,
      defaultTrack: input.defaultTrack,
      totalDays: input.totalDays,
      caseMissMessage: input.caseMissMessage,
      ingestTime: input.ingestTime,
      ingestTimezone: input.ingestTimezone,
      notionPageId: input.notionPageId,
    };
    const course = await tx.course.upsert({
      where: { slug },
      create: { slug, ...fields, status: input.status ?? "DRAFT" },
      // An omitted status keeps whatever the admin set.
      update: { ...fields, ...(input.status ? { status: input.status } : {}) },
    });

    for (const m of plan.modules) {
      await tx.module.upsert({
        where: { courseId_number: { courseId: course.id, number: m.number } },
        create: { courseId: course.id, ...m },
        update: { title: m.title, dayFrom: m.dayFrom, dayTo: m.dayTo },
      });
    }
    await tx.module.deleteMany({
      where: { courseId: course.id, number: { notIn: plan.modules.map((m) => m.number) } },
    });

    for (const d of plan.days) {
      await tx.syllabusDay.upsert({
        where: { courseId_day: { courseId: course.id, day: d.day } },
        create: { courseId: course.id, ...d },
        update: { moduleNumber: d.moduleNumber, title: d.title },
      });
    }
    await tx.syllabusDay.deleteMany({ where: { courseId: course.id, day: { gt: input.totalDays } } });

    return {
      courseId: course.id,
      created: !existing,
      message: `${existing ? "updated" : "created"} course ${slug}: ${plan.modules.length} modules, ${plan.days.length} days`,
    };
  }, { timeout: 30_000 });
}

// ───────────── PUT /courses/[slug]/lessons/[day] ─────────────

export async function upsertLesson(db: PrismaClient, slug: string, day: number, input: LessonInput) {
  return db.$transaction(async (tx) => {
    const course = await getCourse(tx, slug);
    const syllabusDay = await tx.syllabusDay.findUnique({
      where: { courseId_day: { courseId: course.id, day } },
    });
    const questions = prepareLesson(input, day, { trackKeys: course.trackKeys, syllabusDay });

    const existing = await tx.lesson.findUnique({ where: { courseId_day: { courseId: course.id, day } } });
    const fields = {
      moduleNumber: input.module,
      title: input.title,
      trackTitles: input.trackTitles ?? {},
      content: input.content,
    };
    const lesson = await tx.lesson.upsert({
      where: { courseId_day: { courseId: course.id, day } },
      create: { courseId: course.id, day, ...fields },
      update: fields, // publishedAt keeps the first publish time
    });
    const removed = await replaceQuestions(tx, { courseId: course.id, lessonId: lesson.id }, questions);

    return {
      lessonId: lesson.id,
      created: !existing,
      message:
        `${existing ? "updated" : "published"} ${slug} day ${day}: ${Object.keys(input.content).join("+")}, ` +
        `${questions.length} questions${removed ? ` (${removed} removed)` : ""}`,
    };
  });
}

// ───────────── PATCH /courses/[slug]/lessons/[day]/append ─────────────

export async function appendToLesson(db: PrismaClient, slug: string, day: number, input: AppendInput) {
  return db.$transaction(async (tx) => {
    const course = await getCourse(tx, slug);
    const lesson = await tx.lesson.findUnique({ where: { courseId_day: { courseId: course.id, day } } });
    if (!lesson) throw new IngestError(404, `${slug} day ${day} is not published`);
    const content = appendSections(lesson.content as Record<string, string>, input.section, course.trackKeys);
    await tx.lesson.update({ where: { id: lesson.id }, data: { content } });
    return { lessonId: lesson.id, message: `appended to ${slug} day ${day}: ${Object.keys(input.section).join("+")}` };
  });
}

// ───────────── PUT /courses/[slug]/modules/[n] ─────────────

export async function upsertModuleTest(db: PrismaClient, slug: string, n: number, input: ModuleTestInput) {
  return db.$transaction(async (tx) => {
    const course = await getCourse(tx, slug);
    const issues: string[] = [];
    if (input.module !== n) issues.push(`body module ${input.module} does not match URL module ${n}`);
    const mod = await tx.module.findUnique({ where: { courseId_number: { courseId: course.id, number: n } } });
    if (!mod) issues.push(`module ${n} is not in the course syllabus`);
    const { questions, issues: qIssues } = prepareQuestions(input.quiz, course.trackKeys);
    issues.push(...qIssues);
    if (issues.length || !mod) throw new IngestError(422, "invalid module test", issues);

    const removed = await replaceQuestions(tx, { courseId: course.id, moduleId: mod.id }, questions);
    return {
      moduleId: mod.id,
      message: `module ${n} test for ${slug}: ${questions.length} questions${removed ? ` (${removed} removed)` : ""}`,
    };
  });
}
