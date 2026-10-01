// Which lessons a learner can open. Pure: callers pass "today" in the learner's time zone.
import { addDays, daysBetween, nextDailyTime, type LocalDate } from "../time/zoned.ts";

export type Pace = "DAILY" | "SELF";

export type UnlockState = {
  pace: Pace;
  /** Daily pace: the anchor day was open on the anchor date; one more day opens per calendar day after. */
  dailyAnchorDate: LocalDate;
  dailyAnchorDay: number;
};

/** Published lesson days, any order. Gaps are allowed (a day may be published late). */
export type Published = readonly number[];

const latest = (published: Published) => (published.length ? Math.max(...published) : 0);

/**
 * The highest day number the learner may open (before intersecting with what is published).
 * Daily: anchorDay + calendar days since anchorDate, capped at the latest published day.
 * Self-paced: the latest published day.
 */
export function unlockedThrough(state: UnlockState, published: Published, today: LocalDate): number {
  const cap = latest(published);
  if (state.pace === "SELF") return cap;
  const allowance = state.dailyAnchorDay + Math.max(0, daysBetween(state.dailyAnchorDate, today));
  return Math.min(cap, allowance);
}

export function isUnlocked(state: UnlockState, published: Published, today: LocalDate, day: number): boolean {
  return published.includes(day) && day <= unlockedThrough(state, published, today);
}

/** The local date on which a published-but-locked day opens under daily pace. */
export function unlocksOn(state: UnlockState, day: number): LocalDate {
  return addDays(state.dailyAnchorDate, Math.max(0, day - state.dailyAnchorDay));
}

/** Enrollment fields for a brand-new enrollment: Day 1 opens today. */
export function newEnrollmentUnlock(pace: Pace, today: LocalDate): UnlockState {
  return { pace, dailyAnchorDate: today, dailyAnchorDay: 1 };
}

/**
 * Switching pace never re-locks a day that is open now. Switching to DAILY re-anchors at today with
 * everything currently open, so the next day opens tomorrow.
 */
export function changePace(state: UnlockState, to: Pace, published: Published, today: LocalDate): UnlockState {
  if (to === state.pace) return state;
  if (to === "SELF") return { ...state, pace: "SELF" };
  const open = Math.max(1, unlockedThrough(state, published, today));
  return { pace: "DAILY", dailyAnchorDate: today, dailyAnchorDay: open };
}

// ───────────── "What's next" for a learner ─────────────

export type NextUnlock =
  | { kind: "complete" } // every syllabus day is published and open
  | { kind: "daily"; day: number; on: LocalDate } // daily pace: the next published day opens at local midnight on `on`
  | { kind: "ingest"; day: number; at: Date }; // caught up with what's published; next lesson arrives with the next ingest

export function nextUnlock(
  state: UnlockState,
  published: Published,
  totalDays: number,
  today: LocalDate,
  now: Date,
  ingest: { time: string; timezone: string },
): NextUnlock {
  const through = unlockedThrough(state, published, today);
  const lockedPublished = published.filter((d) => d > through).sort((a, b) => a - b);
  if (lockedPublished[0] !== undefined) {
    return { kind: "daily", day: lockedPublished[0], on: unlocksOn(state, lockedPublished[0]) };
  }
  const next = latest(published) + 1;
  if (next > totalDays) return { kind: "complete" };
  return { kind: "ingest", day: next, at: nextDailyTime(now, ingest.time, ingest.timezone) };
}
