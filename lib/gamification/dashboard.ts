// Everything the dashboard hook loop needs, in one place. Server-only.
import { cache } from "react";
import { db } from "@/lib/db";
import { reviewableItems } from "@/lib/review/service";
import { addDays, dateColumn, fromDateColumn, localDate } from "@/lib/time/zoned";
import { DEFAULT_GOAL } from "./goal";
import { heatmapWeeks, type HeatDay } from "./heatmap";
import { levelInfo } from "./levels";
import { newStreak, streakToday } from "./streak";

export const HEATMAP_WEEKS = 18;

export const getHookLoop = cache(async (userId: string, timezone: string) => {
  const today = localDate(new Date(), timezone);
  const since = addDays(today, -HEATMAP_WEEKS * 7);
  const [xpSum, streakRow, goalRow, todayRow, recent, achievementCount, reviewDue, byDay, frozen] = await Promise.all([
    db.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } }),
    db.streak.findUnique({ where: { userId } }),
    db.dailyGoal.findUnique({ where: { userId } }),
    db.dailyActivity.findUnique({ where: { userId_date: { userId, date: dateColumn(today) } } }),
    db.userAchievement.findMany({ where: { userId }, orderBy: { unlockedAt: "desc" }, take: 4, include: { achievement: true } }),
    db.userAchievement.count({ where: { userId } }),
    reviewableItems(db, userId, new Date()).then((items) => items.length),
    db.xpEvent.groupBy({ by: ["localDate", "courseId"], where: { userId, localDate: { gte: dateColumn(since) } }, _sum: { amount: true } }),
    db.dailyActivity.findMany({ where: { userId, frozen: true, date: { gte: dateColumn(since) } }, select: { date: true } }),
  ]);

  const streak = streakRow
    ? { current: streakRow.current, longest: streakRow.longest, freezes: streakRow.freezes, lastActiveDate: streakRow.lastActiveDate ? fromDateColumn(streakRow.lastActiveDate) : null }
    : newStreak();

  const days = new Map<string, Omit<HeatDay, "date">>();
  for (const row of byDay) {
    const d = fromDateColumn(row.localDate);
    const cur = days.get(d) ?? { xp: 0, byCourse: [], frozen: false };
    const xp = row._sum.amount ?? 0;
    cur.xp += xp;
    if (row.courseId) cur.byCourse.push({ courseId: row.courseId, xp });
    days.set(d, cur);
  }
  for (const f of frozen) {
    const d = fromDateColumn(f.date);
    days.set(d, { ...(days.get(d) ?? { xp: 0, byCourse: [] }), frozen: true });
  }

  return {
    today,
    level: levelInfo(xpSum._sum.amount ?? 0),
    streak: { ...streak, ...streakToday(streak, today) },
    goal: { target: goalRow?.targetXp ?? DEFAULT_GOAL, xpToday: todayRow?.xp ?? 0 },
    achievements: { recent: recent.map((r) => ({ ...r.achievement, unlockedAt: r.unlockedAt })), count: achievementCount },
    reviewDue,
    heatmap: heatmapWeeks(today, HEATMAP_WEEKS, days),
  };
});

/** Per-course progress for a dashboard card. */
export async function courseProgress(userId: string, courseId: string) {
  const [lessons, modules, moduleTotal] = await Promise.all([
    db.lessonProgress.findMany({ where: { userId, courseId }, select: { readAt: true, bestScore: true, total: true, attempts: true } }),
    db.moduleProgress.count({ where: { userId, passedAt: { not: null }, module: { courseId } } }),
    db.module.count({ where: { courseId, questions: { some: { hidden: false } } } }),
  ]);
  const quizzed = lessons.filter((l) => l.attempts > 0 && l.total > 0);
  return {
    read: lessons.filter((l) => l.readAt).length,
    avgBest: quizzed.length ? Math.round((100 * quizzed.reduce((s, l) => s + l.bestScore / l.total, 0)) / quizzed.length) : null,
    modulesPassed: modules,
    modulesWithTests: moduleTotal,
  };
}
