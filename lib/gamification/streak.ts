// The global daily streak. A day counts when the learner earns at least 1 XP from a lesson, quiz or
// review in their own time zone. Freezes cover missed days automatically.
import { addDays, daysBetween, type LocalDate } from "../time/zoned.ts";

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;
export const STREAK_MILESTONES = [7, 30, 100] as const;

export type StreakState = { current: number; longest: number; lastActiveDate: LocalDate | null; freezes: number };

export type StreakUpdate = {
  next: StreakState;
  /** False when today was already counted. */
  counted: boolean;
  /** Missed days covered by freezes (to mark on the calendar). */
  frozenDates: LocalDate[];
  freezeEarned: boolean;
  broken: boolean;
  /** Days since the previous active day (0 if first ever activity). */
  gapDays: number;
  milestones: number[];
};

export const newStreak = (): StreakState => ({ current: 0, longest: 0, lastActiveDate: null, freezes: 1 });

export function applyActivity(s: StreakState, today: LocalDate): StreakUpdate {
  const base = { frozenDates: [] as LocalDate[], freezeEarned: false, broken: false, milestones: [] as number[] };
  if (s.lastActiveDate === today) return { ...base, next: s, counted: false, gapDays: 0 };

  const gap = s.lastActiveDate ? daysBetween(s.lastActiveDate, today) : 0;
  if (gap < 0) return { ...base, next: s, counted: false, gapDays: gap }; // clock went backwards (zone change); ignore

  let { current, freezes } = s;
  const frozenDates: LocalDate[] = [];
  let broken = false;
  const missed = Math.max(0, gap - 1);
  if (!s.lastActiveDate) current = 1;
  else if (missed === 0) current += 1;
  else if (missed <= freezes) {
    freezes -= missed;
    for (let i = 1; i <= missed; i++) frozenDates.push(addDays(s.lastActiveDate, i));
    current += 1;
  } else {
    broken = current > 0;
    current = 1;
  }

  let freezeEarned = false;
  if (current % FREEZE_EVERY === 0 && freezes < MAX_FREEZES) {
    freezes += 1;
    freezeEarned = true;
  }
  return {
    next: { current, longest: Math.max(s.longest, current), lastActiveDate: today, freezes },
    counted: true,
    frozenDates,
    freezeEarned,
    broken,
    gapDays: gap,
    milestones: STREAK_MILESTONES.filter((m) => m === current),
  };
}

/** The streak as it stands today, before any activity: 0 if missed days exceed the freezes left. */
export function streakToday(s: StreakState, today: LocalDate): { current: number; activeToday: boolean; freezesNeeded: number } {
  if (!s.lastActiveDate) return { current: 0, activeToday: false, freezesNeeded: 0 };
  const missed = Math.max(0, daysBetween(s.lastActiveDate, today) - 1);
  return {
    current: missed > s.freezes ? 0 : s.current,
    activeToday: s.lastActiveDate === today,
    freezesNeeded: missed,
  };
}
