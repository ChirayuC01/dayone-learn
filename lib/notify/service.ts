// Sends due reminder emails and weekly summaries. Each is recorded on the user (lastReminderOn /
// lastWeeklySummaryOn) before sending, so re-running a job never sends twice.
import type { PrismaClient } from "@prisma/client";
import { sendEmail } from "../email.ts";
import { streakToday } from "../gamification/streak.ts";
import { weekRange } from "../league/league.ts";
import { dateColumn, fromDateColumn, localDate, type LocalDate } from "../time/zoned.ts";
import { reminderEmail, weeklySummaryEmail } from "./emails.ts";
import { reminderDue, streakAtRisk } from "./reminders.ts";
import { unsubscribeUrl } from "./unsubscribe.ts";

const env = () => ({ appUrl: process.env.APP_URL ?? "http://localhost:3000", secret: process.env.AUTH_SECRET ?? "" });

function localClock(now: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(now);
}

export async function sendReminders(db: PrismaClient, now = new Date()) {
  const { appUrl, secret } = env();
  const users = await db.user.findMany({
    where: { reminderEnabled: true, email: { not: null } },
    select: {
      id: true,
      email: true,
      displayName: true,
      timezone: true,
      reminderTime: true,
      lastReminderOn: true,
      streak: true,
      _count: { select: { enrollments: { where: { archivedAt: null } } } },
    },
  });
  let sent = 0;
  for (const u of users) {
    const today = localDate(now, u.timezone);
    const lastActive = u.streak?.lastActiveDate ? fromDateColumn(u.streak.lastActiveDate) : null;
    const due = reminderDue({
      enabled: true,
      reminderTime: u.reminderTime,
      localTime: localClock(now, u.timezone),
      today,
      lastSentOn: u.lastReminderOn ? fromDateColumn(u.lastReminderOn) : null,
      lastActiveDate: lastActive,
      hasActiveEnrollment: u._count.enrollments > 0,
    });
    if (!due) continue;
    // Claim today's reminder first; a concurrent run that loses the race sends nothing.
    const claimed = await db.user.updateMany({
      where: { id: u.id, OR: [{ lastReminderOn: null }, { lastReminderOn: { not: dateColumn(today) } }] },
      data: { lastReminderOn: dateColumn(today) },
    });
    if (!claimed.count) continue;
    const streak = u.streak
      ? streakAtRisk(streakToday({ ...u.streak, lastActiveDate: lastActive }, today).current, lastActive, today)
      : 0;
    const mail = reminderEmail({
      name: u.displayName ?? "there",
      streak,
      dashboardUrl: new URL("/dashboard", appUrl).toString(),
      unsubscribeUrl: unsubscribeUrl(appUrl, secret, u.id, "reminder"),
    });
    await sendEmail({ to: u.email!, subject: mail.subject, html: mail.html, text: mail.text, unsubscribe: unsubscribeUrl(appUrl, secret, u.id, "reminder") });
    sent++;
  }
  return { checked: users.length, sent };
}

/** Summaries of the league week that started on `weekStart` (run after it has been finalised). */
export async function sendWeeklySummaries(db: PrismaClient, weekStart: LocalDate) {
  const { appUrl, secret } = env();
  const { start, end } = weekRange(weekStart);
  const users = await db.user.findMany({
    where: { weeklySummary: true, email: { not: null }, OR: [{ lastWeeklySummaryOn: null }, { lastWeeklySummaryOn: { not: dateColumn(weekStart) } }] },
    select: { id: true, email: true, displayName: true, streak: true },
  });
  let sent = 0;
  for (const u of users) {
    const [xp, reads, member] = await Promise.all([
      db.xpEvent.aggregate({ where: { userId: u.id, createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
      db.lessonProgress.count({ where: { userId: u.id, readAt: { gte: start, lt: end } } }),
      db.leagueMember.findUnique({ where: { userId_weekStart: { userId: u.id, weekStart: dateColumn(weekStart) } }, include: { league: true } }),
    ]);
    const total = xp._sum.amount ?? 0;
    if (!total && !member) continue; // nothing to report
    const claimed = await db.user.updateMany({
      where: { id: u.id, OR: [{ lastWeeklySummaryOn: null }, { lastWeeklySummaryOn: { not: dateColumn(weekStart) } }] },
      data: { lastWeeklySummaryOn: dateColumn(weekStart) },
    });
    if (!claimed.count) continue;
    const mail = weeklySummaryEmail({
      name: u.displayName ?? "there",
      xp: total,
      lessons: reads,
      streak: u.streak?.current ?? 0,
      league: member?.finalRank ? { tier: member.league.tier, rank: member.finalRank, outcome: member.outcome } : null,
      dashboardUrl: new URL("/dashboard", appUrl).toString(),
      unsubscribeUrl: unsubscribeUrl(appUrl, secret, u.id, "weekly"),
    });
    await sendEmail({ to: u.email!, subject: mail.subject, html: mail.html, text: mail.text, unsubscribe: unsubscribeUrl(appUrl, secret, u.id, "weekly") });
    sent++;
  }
  return { sent };
}
