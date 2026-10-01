// Review queue persistence and review sessions. The Prisma client is passed in.
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { recordActivity, type Rewards } from "../gamification/service.ts";
import { reviewSessionAwards } from "../gamification/xp.ts";
import { gradeQuiz, type GivenAnswer, type QuestionResult } from "../quiz/grade.ts";
import { ATTEMPTS_PER_MINUTE } from "../quiz/progress.ts";
import { QuizError } from "../quiz/errors.ts";
import type { PublicQuestion } from "../quiz/service.ts";
import { dateColumn, localDate } from "../time/zoned.ts";
import { afterReview, enterQueue, INTERVALS, pickSession, SESSION_SIZE } from "./leitner.ts";

/** Wrong answers from a quiz or module test enter (or go back to) box 1, due tomorrow. */
export async function queueWrongAnswers(
  db: PrismaClient,
  input: { userId: string; timezone: string; courseId: string; results: Pick<QuestionResult, "questionId" | "correct">[]; now: Date },
) {
  const today = localDate(input.now, input.timezone);
  const { box, dueAt } = enterQueue(today, input.timezone);
  for (const r of input.results.filter((x) => !x.correct)) {
    await db.reviewItem.upsert({
      where: { userId_questionId: { userId: input.userId, questionId: r.questionId } },
      create: { userId: input.userId, questionId: r.questionId, courseId: input.courseId, box, dueAt },
      update: { box, dueAt },
    });
  }
}

const reviewSelect = {
  questionId: true,
  courseId: true,
  box: true,
  dueAt: true,
  question: {
    select: {
      id: true,
      kind: true,
      prompt: true,
      options: true,
      answerIndex: true,
      accept: true,
      caseSensitive: true,
      explain: true,
      tracks: true,
      hidden: true,
      course: { select: { title: true, slug: true, accent: true, caseMissMessage: true } },
    },
  },
} as const;

/**
 * Review items the learner can be asked now (or at all, with `includeFuture`): the course is an active
 * enrollment, the question isn't hidden, and it belongs to the learner's track in that course.
 */
export async function reviewableItems(db: PrismaClient, userId: string, now: Date, includeFuture = false) {
  const [items, enrollments] = await Promise.all([
    db.reviewItem.findMany({
      where: { userId, ...(includeFuture ? {} : { dueAt: { lte: now } }) },
      select: reviewSelect,
      orderBy: { dueAt: "asc" },
    }),
    db.enrollment.findMany({ where: { userId, archivedAt: null }, select: { courseId: true, track: true } }),
  ]);
  const track = new Map(enrollments.map((e) => [e.courseId, e.track]));
  return items.filter((i) => {
    const t = track.get(i.courseId);
    return t !== undefined && !i.question.hidden && (i.question.tracks.length === 0 || i.question.tracks.includes(t));
  });
}

export type ReviewQuestion = PublicQuestion & { course: { title: string; slug: string; accent: string }; box: number };

/** The next session: up to 5 due questions, mixed across courses. No answers included. */
export async function nextSession(db: PrismaClient, userId: string, now = new Date()): Promise<{ questions: ReviewQuestion[]; due: number }> {
  const due = await reviewableItems(db, userId, now);
  const picked = pickSession(due, now);
  return {
    due: due.length,
    questions: picked.map((i) => ({
      id: i.question.id,
      kind: i.question.kind,
      prompt: i.question.prompt,
      options: i.question.options,
      box: i.box,
      course: { title: i.question.course.title, slug: i.question.course.slug, accent: i.question.course.accent },
    })),
  };
}

/** Queue overview for the empty state: items per box and the next due time. */
export async function queueSummary(db: PrismaClient, userId: string, now = new Date()) {
  const all = await reviewableItems(db, userId, now, true);
  const perBox = INTERVALS.map((_, i) => all.filter((x) => x.box === i + 1).length);
  const next = all.find((x) => x.dueAt.getTime() > now.getTime())?.dueAt ?? null;
  return { total: all.length, perBox, next };
}

export type ReviewResult = {
  score: number;
  total: number;
  results: (QuestionResult & { caseMissMessage?: string; box: { from: number; to: number; dueAt: string } })[];
  rewards: Rewards;
  fullSession: boolean;
};

export async function submitReview(
  db: PrismaClient,
  input: { userId: string; timezone: string; answers: { questionId: string; value: GivenAnswer }[]; now?: Date },
): Promise<ReviewResult> {
  const now = input.now ?? new Date();
  const today = localDate(now, input.timezone);

  const recent = await db.attempt.count({ where: { userId: input.userId, createdAt: { gt: new Date(now.getTime() - 60_000) } } });
  if (recent >= ATTEMPTS_PER_MINUTE) throw new QuizError(429, "Too many attempts. Take a breath and try again in a minute.");

  // Only questions that are due right now count; a replayed submission finds nothing due.
  const wanted = new Set(input.answers.map((a) => a.questionId));
  const items = (await reviewableItems(db, input.userId, now)).filter((i) => wanted.has(i.questionId)).slice(0, SESSION_SIZE);
  if (!items.length) throw new QuizError(409, "Those questions aren't due for review any more.");

  const grade = gradeQuiz(
    items.map((i) => i.question),
    new Map(input.answers.map((a) => [a.questionId, a.value])),
  );
  const moves = new Map(
    items.map((i) => {
      const r = grade.results.find((x) => x.questionId === i.questionId)!;
      return [i.questionId, { from: i.box, ...afterReview(i, r.correct, today, input.timezone) }];
    }),
  );

  await db.$transaction(async (tx) => {
    for (const [questionId, m] of moves) {
      await tx.reviewItem.update({ where: { userId_questionId: { userId: input.userId, questionId } }, data: { box: m.box, dueAt: m.dueAt } });
    }
    await tx.attempt.create({
      data: {
        userId: input.userId,
        courseId: null,
        scope: "REVIEW",
        refId: randomUUID(),
        track: null,
        score: grade.score,
        total: grade.total,
        answers: grade.results.map((r) => ({ questionId: r.questionId, given: r.given, correct: r.correct })),
      },
    });
  });

  const rewarded = await db.xpEvent.count({ where: { userId: input.userId, reason: "REVIEW_SESSION", localDate: dateColumn(today) } });
  const awards = reviewSessionAwards({ userId: input.userId, date: today, answered: grade.total, sessionsRewardedToday: rewarded });
  const rewards = await recordActivity(db, { userId: input.userId, timezone: input.timezone, now, awards, counts: { reviews: 1 } });

  const caseMsg = new Map(items.map((i) => [i.questionId, i.question.course.caseMissMessage]));
  return {
    score: grade.score,
    total: grade.total,
    fullSession: grade.total >= SESSION_SIZE,
    rewards,
    results: grade.results.map((r) => {
      const m = moves.get(r.questionId)!;
      return {
        ...r,
        ...(r.caseMiss ? { caseMissMessage: caseMsg.get(r.questionId) } : {}),
        box: { from: m.from, to: m.box, dueAt: m.dueAt.toISOString() },
      };
    }),
  };
}
