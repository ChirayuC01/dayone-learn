// Applies XP awards and everything that follows from them (streak, daily goal, level, achievements,
// course completion) in one transaction per user. Every XP-earning action goes through recordActivity.
import type { Prisma, PrismaClient } from "@prisma/client";
import { dateColumn, fromDateColumn, localDate, localHour } from "../time/zoned.ts";
import { newlyUnlocked, type ActivityEvent, type Stats } from "./achievements.ts";
import { crossesGoal, DEFAULT_GOAL } from "./goal.ts";
import { levelInfo, type LevelInfo } from "./levels.ts";
import { applyActivity } from "./streak.ts";
import {
  ACTIVITY_REASONS,
  courseCompletedAward,
  dailyGoalAward,
  isCourseComplete,
  REASON_LABEL,
  streakMilestoneAwards,
  type Award,
  type XpReason,
} from "./xp.ts";

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

export type UnlockedAchievement = { key: string; title: string; description: string; icon: string; tier: string };

export type Rewards = {
  xp: number;
  breakdown: { reason: XpReason; label: string; amount: number }[];
  level: { before: number; after: number; info: LevelInfo };
  streak: { current: number; longest: number; freezes: number; extended: boolean; freezeEarned: boolean; frozenDays: number };
  goal: { xpToday: number; target: number; hit: boolean };
  achievements: UnlockedAchievement[];
  courseCompleted: boolean;
};

export type ActivityInput = {
  userId: string;
  timezone: string;
  now?: Date;
  awards: Award[];
  /** Counters for the day's activity row. */
  counts?: { lessons?: number; quizzes?: number; reviews?: number };
  /** A lesson was just finished (for Night Owl / Early Bird). */
  lessonFinished?: boolean;
  /** Check whether this course is now complete. */
  completionCourseId?: string;
};

async function insertAwards(tx: Tx, userId: string, date: string, awards: Award[]) {
  if (!awards.length) return [];
  return tx.xpEvent.createManyAndReturn({
    data: awards.map((a) => ({ userId, courseId: a.courseId ?? null, reason: a.reason, amount: a.amount, refKey: a.refKey, localDate: dateColumn(date) })),
    skipDuplicates: true, // refKey is unique: an award already given is silently skipped
    select: { reason: true, amount: true },
  });
}

async function totalXp(tx: Tx, userId: string) {
  return (await tx.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } }))._sum.amount ?? 0;
}

async function courseNowComplete(tx: Tx, userId: string, courseId: string) {
  const [course, reads, modules, passes] = await Promise.all([
    tx.course.findUnique({ where: { id: courseId }, select: { totalDays: true } }),
    tx.lessonProgress.findMany({ where: { userId, courseId, readAt: { not: null } }, select: { lesson: { select: { day: true } } } }),
    tx.module.findMany({ where: { courseId, questions: { some: { hidden: false } } }, select: { id: true } }),
    tx.moduleProgress.findMany({ where: { userId, passedAt: { not: null }, module: { courseId } }, select: { moduleId: true } }),
  ]);
  if (!course) return false;
  return isCourseComplete({
    totalDays: course.totalDays,
    readDays: new Set(reads.map((r) => r.lesson.day)),
    modulesWithTests: modules.map((m) => m.id),
    passedModules: new Set(passes.map((p) => p.moduleId)),
  });
}

async function gatherStats(tx: Tx, userId: string, streak: number, xp: number): Promise<Stats> {
  const [lessonsRead, perfectQuizzes, modulesPassed, perfectModules, enrollments, coursesCompleted, reviews] = await Promise.all([
    tx.lessonProgress.count({ where: { userId, readAt: { not: null } } }),
    tx.lessonProgress.count({ where: { userId, firstPerfectAt: { not: null } } }),
    tx.moduleProgress.count({ where: { userId, passedAt: { not: null } } }),
    tx.moduleProgress.count({ where: { userId, firstPerfectAt: { not: null } } }),
    tx.enrollment.count({ where: { userId } }),
    tx.enrollment.count({ where: { userId, completedAt: { not: null } } }),
    tx.attempt.aggregate({ where: { userId, scope: "REVIEW" }, _sum: { total: true } }),
  ]);
  return {
    lessonsRead,
    perfectQuizzes,
    modulesPassed,
    perfectModules,
    streak,
    enrollments,
    coursesCompleted,
    reviewAnswers: reviews._sum.total ?? 0,
    totalXp: xp,
    level: levelInfo(xp).level,
  };
}

export async function recordActivity(db: PrismaClient, input: ActivityInput): Promise<Rewards> {
  const now = input.now ?? new Date();
  const today = localDate(now, input.timezone);
  const { userId } = input;

  return db.$transaction(async (tx) => {
    // Serialise a user's concurrent actions on their streak row.
    await tx.streak.upsert({ where: { userId }, create: { userId }, update: {} });
    await tx.$queryRaw`SELECT 1 FROM "Streak" WHERE "userId" = ${userId} FOR UPDATE`;
    const goalRow = await tx.dailyGoal.upsert({ where: { userId }, create: { userId, targetXp: DEFAULT_GOAL }, update: {} });
    const streakRow = await tx.streak.findUniqueOrThrow({ where: { userId } });

    const xpBefore = await totalXp(tx, userId);
    const dayBefore = await tx.dailyActivity.findUnique({ where: { userId_date: { userId, date: dateColumn(today) } } });
    const created = await insertAwards(tx, userId, today, input.awards);

    // Streak: only learning XP counts.
    const activityXp = created.filter((c) => ACTIVITY_REASONS.includes(c.reason)).reduce((s, c) => s + c.amount, 0);
    let streak = {
      current: streakRow.current,
      longest: streakRow.longest,
      freezes: streakRow.freezes,
      extended: false,
      freezeEarned: false,
      frozenDays: 0,
    };
    const event: ActivityEvent = {};
    if (input.lessonFinished) event.lessonReadAtHour = localHour(now, input.timezone);
    if (activityXp > 0) {
      const u = applyActivity(
        { current: streakRow.current, longest: streakRow.longest, freezes: streakRow.freezes, lastActiveDate: streakRow.lastActiveDate ? fromDateColumn(streakRow.lastActiveDate) : null },
        today,
      );
      if (u.counted) {
        await tx.streak.update({
          where: { userId },
          data: { current: u.next.current, longest: u.next.longest, freezes: u.next.freezes, lastActiveDate: dateColumn(today) },
        });
        for (const d of u.frozenDates) {
          await tx.dailyActivity.upsert({
            where: { userId_date: { userId, date: dateColumn(d) } },
            create: { userId, date: dateColumn(d), frozen: true },
            update: { frozen: true },
          });
        }
        created.push(...(await insertAwards(tx, userId, today, streakMilestoneAwards(userId, u.milestones))));
        if (u.gapDays > 1) event.missedDays = u.gapDays - 1;
        streak = { ...u.next, extended: true, freezeEarned: u.freezeEarned, frozenDays: u.frozenDates.length };
      }
    }

    // Course completion (once).
    let courseCompleted = false;
    if (input.completionCourseId) {
      const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: input.completionCourseId } } });
      if (enrollment && !enrollment.completedAt && (await courseNowComplete(tx, userId, input.completionCourseId))) {
        await tx.enrollment.update({ where: { id: enrollment.id }, data: { completedAt: now } });
        created.push(...(await insertAwards(tx, userId, today, [courseCompletedAward(userId, input.completionCourseId)])));
        courseCompleted = true;
      }
    }

    // Daily goal.
    const xpTodayBefore = dayBefore?.xp ?? 0;
    let gained = created.reduce((s, c) => s + c.amount, 0);
    let goalHit = false;
    if (crossesGoal(xpTodayBefore, xpTodayBefore + gained, goalRow.targetXp)) {
      const g = await insertAwards(tx, userId, today, [dailyGoalAward(userId, today)]);
      if (g.length) {
        created.push(...g);
        gained += g[0]!.amount;
        goalHit = true;
        await tx.dailyGoal.update({ where: { userId }, data: { lastHitDate: dateColumn(today) } });
      }
    }

    const counts = input.counts ?? {};
    if (gained > 0 || counts.lessons || counts.quizzes || counts.reviews) {
      const inc = { xp: gained, lessons: counts.lessons ?? 0, quizzes: counts.quizzes ?? 0, reviews: counts.reviews ?? 0 };
      await tx.dailyActivity.upsert({
        where: { userId_date: { userId, date: dateColumn(today) } },
        create: { userId, date: dateColumn(today), ...inc },
        update: { xp: { increment: inc.xp }, lessons: { increment: inc.lessons }, quizzes: { increment: inc.quizzes }, reviews: { increment: inc.reviews } },
      });
    }

    const xpAfter = xpBefore + gained;
    const before = levelInfo(xpBefore).level;
    const info = levelInfo(xpAfter);

    // Achievements, evaluated after every action.
    const [catalogue, have] = await Promise.all([
      tx.achievement.findMany({ orderBy: { sortOrder: "asc" } }),
      tx.userAchievement.findMany({ where: { userId }, select: { key: true } }),
    ]);
    const unlocked = newlyUnlocked(catalogue, new Set(have.map((h) => h.key)), await gatherStats(tx, userId, streak.current, xpAfter), event);
    if (unlocked.length) {
      await tx.userAchievement.createMany({ data: unlocked.map((a) => ({ userId, key: a.key, unlockedAt: now })), skipDuplicates: true });
    }

    return {
      xp: gained,
      breakdown: created.map((c) => ({ reason: c.reason, label: REASON_LABEL[c.reason], amount: c.amount })),
      level: { before, after: info.level, info },
      streak,
      goal: { xpToday: xpTodayBefore + gained, target: goalRow.targetXp, hit: goalHit },
      achievements: unlocked.map(({ key, title, description, icon, tier }) => ({ key, title, description, icon, tier })),
      courseCompleted,
    };
  }, TX_OPTIONS);
}

/** Rewarded retakes today, for the 3-a-day cap. */
export async function retakesRewardedToday(db: PrismaClient, userId: string, today: string) {
  return db.xpEvent.count({ where: { userId, reason: "RETAKE_IMPROVEMENT", localDate: dateColumn(today) } });
}
