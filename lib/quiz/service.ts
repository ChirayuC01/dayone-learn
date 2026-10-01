// Quiz submission: access checks, server-side grading and persistence. The browser never sees
// answers before it submits. The Prisma client is passed in.
import type { Prisma, PrismaClient } from "@prisma/client";
import { questionsForTrack, type TrackDef } from "../ingest/normalize.ts";
import { canRead, dayAccess, moduleTestAccess } from "../learning/access.ts";
import { unlockStateOf } from "../learning/enrollment.ts";
import { localDate } from "../time/zoned.ts";
import { gradeQuiz, type GivenAnswer, type GradableQuestion, type QuestionResult } from "./grade.ts";
import { applyAttempt, ATTEMPTS_PER_MINUTE, MODULE_PASS_RATIO } from "./progress.ts";

export class QuizError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "QuizError";
  }
}

export type Scope = "LESSON" | "MODULE";

/** What the quiz UI may know before submitting: no answers, no explanations. */
export type PublicQuestion = { id: string; kind: GradableQuestion["kind"]; prompt: string; options: string[] };

const questionSelect = {
  id: true,
  kind: true,
  prompt: true,
  options: true,
  answerIndex: true,
  accept: true,
  caseSensitive: true,
  explain: true,
  tracks: true,
} satisfies Prisma.QuestionSelect;

type Target = {
  courseId: string;
  course: { tracks: TrackDef[]; defaultTrack: string; totalDays: number; caseMissMessage: string };
  questions: Prisma.QuestionGetPayload<{ select: typeof questionSelect }>[];
  /** Whether the learner may take it, given their enrollment and today's date. */
  allowed: (ctx: { published: number[]; unlock: ReturnType<typeof unlockStateOf>; today: string }) => boolean;
};

async function loadTarget(db: PrismaClient, scope: Scope, refId: string): Promise<Target | null> {
  const courseSelect = { tracks: true, defaultTrack: true, totalDays: true, caseMissMessage: true, status: true } as const;
  const questions = { where: { hidden: false }, orderBy: { order: "asc" as const }, select: questionSelect };
  if (scope === "LESSON") {
    const l = await db.lesson.findUnique({ where: { id: refId }, select: { day: true, courseId: true, course: { select: courseSelect }, questions } });
    if (!l || l.course.status === "DRAFT") return null;
    return {
      courseId: l.courseId,
      course: { ...l.course, tracks: l.course.tracks as TrackDef[] },
      questions: l.questions,
      allowed: ({ published, unlock, today }) => canRead(dayAccess(l.day, published, unlock, today)),
    };
  }
  const m = await db.module.findUnique({
    where: { id: refId },
    select: { dayTo: true, courseId: true, course: { select: courseSelect }, questions },
  });
  if (!m || m.course.status === "DRAFT") return null;
  return {
    courseId: m.courseId,
    course: { ...m.course, tracks: m.course.tracks as TrackDef[] },
    questions: m.questions,
    allowed: ({ published, unlock, today }) =>
      moduleTestAccess({ dayTo: m.dayTo, testQuestions: m.questions.length }, published, unlock, today) === "open",
  };
}

export type AttemptResult = {
  attemptId: string;
  score: number;
  total: number;
  results: (QuestionResult & { caseMissMessage?: string })[];
  best: { score: number; total: number; attempts: number };
  improved: boolean;
  firstPerfect: boolean;
  /** Module tests only. */
  passed?: boolean;
  firstPass?: boolean;
};

export async function submitAttempt(
  db: PrismaClient,
  input: { userId: string; timezone: string; scope: Scope; refId: string; answers: { questionId: string; value: GivenAnswer }[]; now?: Date },
): Promise<AttemptResult> {
  const now = input.now ?? new Date();
  const target = await loadTarget(db, input.scope, input.refId);
  if (!target) throw new QuizError(404, "Quiz not found.");

  const enrollment = await db.enrollment.findUnique({ where: { userId_courseId: { userId: input.userId, courseId: target.courseId } } });
  if (!enrollment || enrollment.archivedAt) throw new QuizError(403, "Enroll in this course to take its quizzes.");

  const lessons = await db.lesson.findMany({ where: { courseId: target.courseId }, select: { day: true } });
  const ctx = { published: lessons.map((l) => l.day), unlock: unlockStateOf(enrollment), today: localDate(now, input.timezone) };
  if (!target.allowed(ctx)) throw new QuizError(403, "This quiz isn't unlocked yet.");

  const recent = await db.attempt.count({ where: { userId: input.userId, createdAt: { gt: new Date(now.getTime() - 60_000) } } });
  if (recent >= ATTEMPTS_PER_MINUTE) throw new QuizError(429, "Too many attempts. Take a breath and try again in a minute.");

  const track = target.course.tracks.some((t) => t.key === enrollment.track) ? enrollment.track : target.course.defaultTrack;
  const questions = questionsForTrack(target.questions, track);
  if (!questions.length) throw new QuizError(404, "This quiz has no questions yet.");

  const grade = gradeQuiz(questions, new Map(input.answers.map((a) => [a.questionId, a.value])));
  const isModule = input.scope === "MODULE";

  const result = await db.$transaction(async (tx) => {
    const attempt = await tx.attempt.create({
      data: {
        userId: input.userId,
        courseId: target.courseId,
        scope: input.scope,
        refId: input.refId,
        track,
        score: grade.score,
        total: grade.total,
        answers: grade.results.map((r) => ({ questionId: r.questionId, given: r.given, correct: r.correct })),
      },
    });

    if (isModule) {
      const key = { userId_moduleId: { userId: input.userId, moduleId: input.refId } };
      const prev = await tx.moduleProgress.findUnique({ where: key });
      const next = applyAttempt(prev, { ...grade, at: now }, MODULE_PASS_RATIO);
      const data = { bestScore: next.bestScore, total: next.total, attempts: next.attempts, firstPerfectAt: next.firstPerfectAt, passedAt: next.passedAt };
      await tx.moduleProgress.upsert({ where: key, create: { userId: input.userId, moduleId: input.refId, ...data }, update: data });
      return { attempt, next, passed: next.passedAt != null };
    }
    const key = { userId_lessonId: { userId: input.userId, lessonId: input.refId } };
    const prev = await tx.lessonProgress.findUnique({ where: key });
    const next = applyAttempt(prev, { ...grade, at: now });
    const data = { bestScore: next.bestScore, total: next.total, attempts: next.attempts, firstPerfectAt: next.firstPerfectAt };
    await tx.lessonProgress.upsert({
      where: key,
      create: { userId: input.userId, lessonId: input.refId, courseId: target.courseId, ...data },
      update: data,
    });
    return { attempt, next, passed: undefined };
  });

  return {
    attemptId: result.attempt.id,
    score: grade.score,
    total: grade.total,
    results: grade.results.map((r) => (r.caseMiss ? { ...r, caseMissMessage: target.course.caseMissMessage } : r)),
    best: { score: result.next.bestScore, total: result.next.total, attempts: result.next.attempts },
    improved: result.next.improved,
    firstPerfect: result.next.firstPerfect,
    ...(isModule ? { passed: result.passed, firstPass: result.next.firstPass } : {}),
  };
}

/** Questions for the quiz UI on a track, without answers. */
export async function publicQuestions(db: PrismaClient, scope: Scope, refId: string, track: string): Promise<PublicQuestion[]> {
  const rows = await db.question.findMany({
    where: { hidden: false, ...(scope === "LESSON" ? { lessonId: refId } : { moduleId: refId }) },
    orderBy: { order: "asc" },
    select: { id: true, kind: true, prompt: true, options: true, tracks: true },
  });
  return questionsForTrack(rows, track).map(({ tracks: _t, ...q }) => q);
}
