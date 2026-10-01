// Weekly leagues. Pure. A week starts Monday 00:00 IST for everyone.
import { addDays, localDate, zonedTimeToUtc, type LocalDate } from "../time/zoned.ts";

export const LEAGUE_TZ = "Asia/Kolkata";
export const COHORT_SIZE = 30;
export const ZONE_SIZE = 5;
export const ACTIVE_WINDOW_DAYS = 14;
export const TIERS = ["BRONZE", "SILVER", "GOLD", "SAPPHIRE", "DIAMOND"] as const;
export type Tier = (typeof TIERS)[number];

/** The Monday (IST calendar date) of the league week containing `now`. */
export function weekStartOf(now: Date): LocalDate {
  const today = localDate(now, LEAGUE_TZ);
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(today, -dow);
}

/** [start, end) instants of a league week. */
export function weekRange(weekStart: LocalDate): { start: Date; end: Date } {
  return { start: zonedTimeToUtc(weekStart, "00:00", LEAGUE_TZ), end: zonedTimeToUtc(addDays(weekStart, 7), "00:00", LEAGUE_TZ) };
}

/** FNV-1a: a stable pseudo-random order so cohorts mix people without a random source. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Splits each tier's players into cohorts of at most 30, as evenly as possible, in a shuffled but
 * deterministic order (the same input always gives the same cohorts, so the job is repeatable).
 */
export function assignCohorts(players: { userId: string; tier: Tier }[], weekStart: LocalDate, size = COHORT_SIZE) {
  const out: { tier: Tier; cohort: number; userIds: string[] }[] = [];
  for (const tier of TIERS) {
    const ids = players
      .filter((p) => p.tier === tier)
      .map((p) => p.userId)
      .sort((a, b) => hash(`${weekStart}:${a}`) - hash(`${weekStart}:${b}`) || a.localeCompare(b));
    if (!ids.length) continue;
    const k = Math.ceil(ids.length / size);
    for (let c = 0; c < k; c++) out.push({ tier, cohort: c + 1, userIds: ids.filter((_, i) => i % k === c) });
  }
  return out;
}

/** How many are promoted / demoted in a cohort of `n`: 5 each, scaled down for small cohorts so zones never overlap. */
export function zoneSizes(n: number, tier: Tier) {
  const promote = tier === "DIAMOND" ? 0 : Math.min(ZONE_SIZE, Math.ceil(n / 3));
  const demote = tier === "BRONZE" ? 0 : Math.min(ZONE_SIZE, Math.floor(n / 3), n - promote);
  return { promote, demote };
}

export type Outcome = "PROMOTED" | "STAYED" | "DEMOTED";
export type Ranked = { userId: string; weeklyXp: number; rank: number; zone: Outcome };

/** Ranks by weekly XP (ties by user id). Promotion needs at least 1 XP. */
export function rankCohort(members: { userId: string; weeklyXp: number }[], tier: Tier): Ranked[] {
  const sorted = [...members].sort((a, b) => b.weeklyXp - a.weeklyXp || a.userId.localeCompare(b.userId));
  const { promote, demote } = zoneSizes(sorted.length, tier);
  return sorted.map((m, i) => ({
    ...m,
    rank: i + 1,
    zone: i < promote && m.weeklyXp > 0 ? "PROMOTED" : i >= sorted.length - demote ? "DEMOTED" : "STAYED",
  }));
}

export const nextTier = (tier: Tier, outcome: Outcome): Tier => {
  const i = TIERS.indexOf(tier) + (outcome === "PROMOTED" ? 1 : outcome === "DEMOTED" ? -1 : 0);
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, i))]!;
};

/** XP the player needs to enter the promotion zone (0 if already in it, null if the tier has none). */
export function xpToPromotion(ranked: Ranked[], userId: string, tier: Tier): number | null {
  const { promote } = zoneSizes(ranked.length, tier);
  if (!promote) return null;
  const me = ranked.find((r) => r.userId === userId);
  if (!me) return null;
  if (me.zone === "PROMOTED") return 0;
  const target = ranked[promote - 1]!; // the last promoted place
  // Overtaking needs strictly more XP, or equal XP and a lower user id (the tie-break).
  return Math.max(1, target.weeklyXp - me.weeklyXp + (me.userId < target.userId ? 0 : 1));
}

/**
 * Places new players into a week that may already have cohorts: each player joins the cohort of their
 * tier with the fewest members (if under 30); the rest form new cohorts numbered after the existing ones.
 */
export function fillCohorts(
  existing: { leagueId: string; tier: Tier; cohort: number; size: number }[],
  players: { userId: string; tier: Tier }[],
  weekStart: LocalDate,
  size = COHORT_SIZE,
) {
  const joins: { leagueId: string; userId: string }[] = [];
  const leftovers: { userId: string; tier: Tier }[] = [];
  const open = existing.map((e) => ({ ...e }));
  const ordered = [...players].sort((a, b) => hash(`${weekStart}:${a.userId}`) - hash(`${weekStart}:${b.userId}`) || a.userId.localeCompare(b.userId));
  for (const p of ordered) {
    const target = open.filter((e) => e.tier === p.tier && e.size < size).sort((a, b) => a.size - b.size || a.cohort - b.cohort)[0];
    if (target) {
      target.size++;
      joins.push({ leagueId: target.leagueId, userId: p.userId });
    } else leftovers.push(p);
  }
  const creates = assignCohorts(leftovers, weekStart, size).map((c) => ({
    ...c,
    cohort: c.cohort + Math.max(0, ...existing.filter((e) => e.tier === c.tier).map((e) => e.cohort)),
  }));
  return { joins, creates };
}
