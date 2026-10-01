// What a visitor may open. Pure; the reader and sidebar both use it.
import type { LocalDate } from "../time/zoned.ts";
import { isUnlocked, type Published, type UnlockState } from "./unlock.ts";

/** Days anyone may read without enrolling (a taste of the course). */
export const PREVIEW_DAYS: readonly number[] = [1];

export type DayAccess =
  | "open" // enrolled and unlocked
  | "preview" // not enrolled, but a free preview day
  | "locked" // enrolled, published, not unlocked yet (daily pace)
  | "enroll" // published, but you need to enroll to read it
  | "upcoming"; // not published yet

/** `enrollment` is null when signed out, not enrolled, or unenrolled (archived). */
export function dayAccess(day: number, published: Published, enrollment: UnlockState | null, today: LocalDate): DayAccess {
  if (!published.includes(day)) return "upcoming";
  if (enrollment) return isUnlocked(enrollment, published, today, day) ? "open" : "locked";
  return PREVIEW_DAYS.includes(day) ? "preview" : "enroll";
}

export const canRead = (a: DayAccess) => a === "open" || a === "preview";

/** A module test opens once its review day (the module's last day) is open. */
export function moduleTestAccess(
  mod: { dayTo: number; testQuestions: number },
  published: Published,
  enrollment: UnlockState | null,
  today: LocalDate,
): "open" | "locked" | "enroll" | "upcoming" {
  if (mod.testQuestions === 0) return "upcoming";
  if (!enrollment) return "enroll";
  return isUnlocked(enrollment, published, today, mod.dayTo) ? "open" : "locked";
}

/** The lesson a "Continue" button should open: the first open day not yet read, else the last open day. */
export function continueDay(openDays: readonly number[], readDays: ReadonlySet<number>): number | null {
  const sorted = [...openDays].sort((a, b) => a - b);
  return sorted.find((d) => !readDays.has(d)) ?? sorted.at(-1) ?? null;
}
