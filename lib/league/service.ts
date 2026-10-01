// League persistence: finalise last week, place this week, live standings. Idempotent and serialised
// with a Postgres advisory lock, so the cron and a learner's first visit can't place anyone twice.
import type { PrismaClient } from "@prisma/client";
import { addDays, dateColumn, type LocalDate } from "../time/zoned.ts";
import {
  ACTIVE_WINDOW_DAYS,
  fillCohorts,
  nextTier,
  rankCohort,
  weekRange,
  weekStartOf,
  xpToPromotion,
  type Tier,
} from "./league.ts";

/** Weekly XP per user for a league week. */
export async function weeklyXp(db: Pick<PrismaClient, "xpEvent">, userIds: string[], weekStart: LocalDate) {
  if (!userIds.length) return new Map<string, number>();
  const { start, end } = weekRange(weekStart);
  const rows = await db.xpEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, createdAt: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.amount ?? 0]));
}

export type LeagueRun = { weekStart: LocalDate; finalized: number; promoted: number; demoted: number; placed: number };

export async function runLeagueWeek(db: PrismaClient, now = new Date()): Promise<LeagueRun> {
  const week = weekStartOf(now);
  const prev = addDays(week, -7);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dayone-league'))`;
      const run: LeagueRun = { weekStart: week, finalized: 0, promoted: 0, demoted: 0, placed: 0 };

      // 1. Finalise last week's cohorts that haven't been finalised.
      const leagues = await tx.league.findMany({
        where: { weekStart: dateColumn(prev) },
        include: { members: { include: { user: { select: { leagueOptOut: true } } } } },
      });
      for (const league of leagues) {
        if (league.members.some((m) => m.finalRank !== null)) continue;
        const xp = await weeklyXp(tx, league.members.map((m) => m.userId), prev);
        const ranked = rankCohort(
          league.members.filter((m) => !m.user.leagueOptOut).map((m) => ({ userId: m.userId, weeklyXp: xp.get(m.userId) ?? 0 })),
          league.tier as Tier,
        );
        for (const m of league.members) {
          const r = ranked.find((x) => x.userId === m.userId);
          await tx.leagueMember.update({
            where: { leagueId_userId: { leagueId: league.id, userId: m.userId } },
            data: { weeklyXp: xp.get(m.userId) ?? 0, finalRank: r?.rank ?? null, outcome: r?.zone ?? null },
          });
          if (r && r.zone !== "STAYED") {
            await tx.user.update({ where: { id: m.userId }, data: { leagueTier: nextTier(league.tier as Tier, r.zone) } });
            if (r.zone === "PROMOTED") run.promoted++;
            else run.demoted++;
          }
        }
        run.finalized++;
      }

      // 2. Place every active, opted-in user who isn't in a league this week yet.
      const since = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000);
      const active = await tx.xpEvent.groupBy({ by: ["userId"], where: { createdAt: { gte: since } }, _sum: { amount: true } });
      const placedAlready = new Set(
        (await tx.leagueMember.findMany({ where: { weekStart: dateColumn(week) }, select: { userId: true } })).map((m) => m.userId),
      );
      const candidates = await tx.user.findMany({
        where: { id: { in: active.filter((a) => (a._sum.amount ?? 0) > 0 && !placedAlready.has(a.userId)).map((a) => a.userId) }, leagueOptOut: false },
        select: { id: true, leagueTier: true },
      });
      if (candidates.length) {
        const existing = await tx.league.findMany({ where: { weekStart: dateColumn(week) }, include: { _count: { select: { members: true } } } });
        const plan = fillCohorts(
          existing.map((l) => ({ leagueId: l.id, tier: l.tier as Tier, cohort: l.cohort, size: l._count.members })),
          candidates.map((c) => ({ userId: c.id, tier: c.leagueTier as Tier })),
          week,
        );
        if (plan.joins.length) {
          await tx.leagueMember.createMany({ data: plan.joins.map((j) => ({ ...j, weekStart: dateColumn(week) })), skipDuplicates: true });
        }
        for (const c of plan.creates) {
          const league = await tx.league.create({ data: { weekStart: dateColumn(week), tier: c.tier, cohort: c.cohort } });
          await tx.leagueMember.createMany({ data: c.userIds.map((userId) => ({ leagueId: league.id, userId, weekStart: dateColumn(week) })), skipDuplicates: true });
        }
        run.placed = candidates.length;
      }
      return run;
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}

export type Standing = {
  status: "member";
  tier: Tier;
  cohort: number;
  weekStart: LocalDate;
  endsAt: Date;
  rows: { rank: number; displayName: string; weeklyXp: number; zone: string; me: boolean }[];
  me: { rank: number; weeklyXp: number; zone: string };
  toPromotion: number | null;
};

/** The learner's league this week, joining one first if they're active and not placed yet. */
export async function myStanding(db: PrismaClient, userId: string, now = new Date()): Promise<Standing | { status: "opted-out" } | { status: "inactive" }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { leagueOptOut: true } });
  if (user.leagueOptOut) return { status: "opted-out" };
  const week = weekStartOf(now);
  let member = await db.leagueMember.findUnique({ where: { userId_weekStart: { userId, weekStart: dateColumn(week) } } });
  if (!member) {
    await runLeagueWeek(db, now);
    member = await db.leagueMember.findUnique({ where: { userId_weekStart: { userId, weekStart: dateColumn(week) } } });
    if (!member) return { status: "inactive" };
  }
  const league = await db.league.findUniqueOrThrow({
    where: { id: member.leagueId },
    include: { members: { include: { user: { select: { displayName: true, leagueOptOut: true } } } } },
  });
  const visible = league.members.filter((m) => !m.user.leagueOptOut);
  const xp = await weeklyXp(db, visible.map((m) => m.userId), week);
  const ranked = rankCohort(visible.map((m) => ({ userId: m.userId, weeklyXp: xp.get(m.userId) ?? 0 })), league.tier as Tier);
  const names = new Map(visible.map((m) => [m.userId, m.user.displayName ?? "Learner"]));
  const me = ranked.find((r) => r.userId === userId)!;
  return {
    status: "member",
    tier: league.tier as Tier,
    cohort: league.cohort,
    weekStart: week,
    endsAt: weekRange(week).end,
    rows: ranked.map((r) => ({ rank: r.rank, displayName: names.get(r.userId)!, weeklyXp: r.weeklyXp, zone: r.zone, me: r.userId === userId })),
    me: { rank: me.rank, weeklyXp: me.weeklyXp, zone: me.zone },
    toPromotion: xpToPromotion(ranked, userId, league.tier as Tier),
  };
}

/** All-time XP board: only learners who opted in, display names only. */
export async function allTimeBoard(db: PrismaClient, limit = 50) {
  const rows = await db.xpEvent.groupBy({
    by: ["userId"],
    where: { user: { allTimeBoardOptIn: true } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: limit,
  });
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } });
  const name = new Map(users.map((u) => [u.id, u.displayName ?? "Learner"]));
  return rows.map((r, i) => ({ rank: i + 1, userId: r.userId, displayName: name.get(r.userId)!, xp: r._sum.amount ?? 0 }));
}
