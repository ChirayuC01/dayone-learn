// XP rules. Every award carries a refKey; the XpEvent.refKey unique index makes awards idempotent.

export type XpReason =
  | "LESSON_READ"
  | "QUIZ_CORRECT"
  | "QUIZ_PERFECT"
  | "RETAKE_IMPROVEMENT"
  | "MODULE_PASSED"
  | "MODULE_PERFECT"
  | "REVIEW_SESSION"
  | "DAILY_GOAL"
  | "STREAK_MILESTONE"
  | "COURSE_COMPLETED";

export type Award = { reason: XpReason; amount: number; refKey: string; courseId?: string | null };

export const XP = {
  lessonRead: 10,
  quizCorrectFirstAttempt: 2,
  quizPerfectBonus: 10,
  retakePerNewlyCorrect: 1,
  retakesRewardedPerDay: 3,
  modulePassed: 50,
  modulePerfect: 25,
  reviewSession: 5,
  reviewSessionsPerDay: 4,
  reviewSessionSize: 5,
  dailyGoal: 5,
  streakMilestones: { 7: 25, 30: 100, 100: 300 } as Record<number, number>,
  courseCompleted: 200,
} as const;

export function lessonReadAwards(userId: string, lessonId: string, courseId: string): Award[] {
  return [{ reason: "LESSON_READ", amount: XP.lessonRead, refKey: `read:${userId}:${lessonId}`, courseId }];
}

/**
 * Lesson quiz XP. First attempt: 2 per correct answer, +10 if perfect. A later attempt that beats the
 * best score: 1 per newly correct answer, for at most 3 rewarded retakes a day (`retakesRewardedToday`).
 * `prevBest` is the best before this attempt, scaled to this attempt's length if the quiz changed.
 */
export function lessonQuizAwards(a: {
  userId: string;
  lessonId: string;
  courseId: string;
  attemptId: string;
  firstAttempt: boolean;
  score: number;
  total: number;
  prevBest: { score: number; total: number } | null;
  retakesRewardedToday: number;
}): Award[] {
  const { userId, lessonId, courseId } = a;
  if (a.firstAttempt) {
    const out: Award[] = [];
    if (a.score > 0) out.push({ reason: "QUIZ_CORRECT", amount: a.score * XP.quizCorrectFirstAttempt, refKey: `quiz-first:${userId}:${lessonId}`, courseId });
    if (a.total > 0 && a.score === a.total) out.push({ reason: "QUIZ_PERFECT", amount: XP.quizPerfectBonus, refKey: `quiz-perfect:${userId}:${lessonId}`, courseId });
    return out;
  }
  if (a.retakesRewardedToday >= XP.retakesRewardedPerDay) return [];
  const prev = a.prevBest ? Math.round((a.prevBest.score / Math.max(1, a.prevBest.total)) * a.total) : 0;
  const newlyCorrect = a.score - prev;
  if (newlyCorrect <= 0) return [];
  return [{ reason: "RETAKE_IMPROVEMENT", amount: newlyCorrect * XP.retakePerNewlyCorrect, refKey: `retake:${userId}:${a.attemptId}`, courseId }];
}

export function moduleTestAwards(a: { userId: string; moduleId: string; courseId: string; firstPass: boolean; firstPerfect: boolean }): Award[] {
  const out: Award[] = [];
  if (a.firstPass) out.push({ reason: "MODULE_PASSED", amount: XP.modulePassed, refKey: `module-pass:${a.userId}:${a.moduleId}`, courseId: a.courseId });
  if (a.firstPerfect) out.push({ reason: "MODULE_PERFECT", amount: XP.modulePerfect, refKey: `module-perfect:${a.userId}:${a.moduleId}`, courseId: a.courseId });
  return out;
}

/**
 * A full review session (5 due questions) earns 5 XP, for at most 4 sessions a day. The refKey uses the
 * day's session slot, so a replayed request can't earn a slot twice.
 */
export function reviewSessionAwards(a: { userId: string; date: string; answered: number; sessionsRewardedToday: number }): Award[] {
  if (a.answered < XP.reviewSessionSize || a.sessionsRewardedToday >= XP.reviewSessionsPerDay) return [];
  return [{ reason: "REVIEW_SESSION", amount: XP.reviewSession, refKey: `review:${a.userId}:${a.date}:${a.sessionsRewardedToday + 1}` }];
}

export function streakMilestoneAwards(userId: string, reached: number[]): Award[] {
  return reached
    .filter((n) => XP.streakMilestones[n])
    .map((n) => ({ reason: "STREAK_MILESTONE" as const, amount: XP.streakMilestones[n]!, refKey: `streak:${userId}:${n}` }));
}

export const dailyGoalAward = (userId: string, date: string): Award => ({ reason: "DAILY_GOAL", amount: XP.dailyGoal, refKey: `goal:${userId}:${date}` });

export const courseCompletedAward = (userId: string, courseId: string): Award => ({
  reason: "COURSE_COMPLETED",
  amount: XP.courseCompleted,
  refKey: `course:${userId}:${courseId}`,
  courseId,
});

/** Reasons that count as learning activity for the streak (bonuses don't). */
export const ACTIVITY_REASONS: readonly XpReason[] = [
  "LESSON_READ",
  "QUIZ_CORRECT",
  "QUIZ_PERFECT",
  "RETAKE_IMPROVEMENT",
  "MODULE_PASSED",
  "MODULE_PERFECT",
  "REVIEW_SESSION",
];

export const REASON_LABEL: Record<XpReason, string> = {
  LESSON_READ: "Lesson read",
  QUIZ_CORRECT: "Correct answers",
  QUIZ_PERFECT: "Perfect quiz",
  RETAKE_IMPROVEMENT: "Retake improvement",
  MODULE_PASSED: "Module test passed",
  MODULE_PERFECT: "Perfect module test",
  REVIEW_SESSION: "Review session",
  DAILY_GOAL: "Daily goal",
  STREAK_MILESTONE: "Streak milestone",
  COURSE_COMPLETED: "Course completed",
};

/** A course is complete when every syllabus day is published and read and every module test is passed. */
export function isCourseComplete(c: {
  totalDays: number;
  readDays: ReadonlySet<number>;
  modulesWithTests: readonly string[];
  passedModules: ReadonlySet<string>;
}): boolean {
  for (let d = 1; d <= c.totalDays; d++) if (!c.readDays.has(d)) return false;
  return c.modulesWithTests.every((m) => c.passedModules.has(m));
}
