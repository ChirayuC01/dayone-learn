// Human-readable unlock messages. Pure: the caller supplies the learner's "today" and time zone.
import { daysBetween, localDate, type LocalDate } from "../time/zoned.ts";
import type { NextUnlock } from "./unlock.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** "today", "tomorrow", or e.g. "on Mon 5 Oct". */
export function relativeDay(on: LocalDate, today: LocalDate): string {
  const diff = daysBetween(today, on);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  const d = new Date(`${on}T12:00:00Z`);
  return "on " + new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** e.g. "4:30 AM" in the learner's zone. */
export function clockTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(instant);
}

export function describeNextUnlock(next: NextUnlock, today: LocalDate, tz: string): string {
  switch (next.kind) {
    case "complete":
      return "Every lesson is open.";
    case "daily":
      return `Day ${pad(next.day)} unlocks ${relativeDay(next.on, today)}.`;
    case "ingest":
      return `Next lesson arrives ${relativeDay(localDate(next.at, tz), today)} at ${clockTime(next.at, tz)}.`;
  }
}

/** Short form for a locked day, e.g. "Unlocks tomorrow". */
export function describeLockedDay(on: LocalDate, today: LocalDate): string {
  const r = relativeDay(on, today);
  return `Unlocks ${r}`;
}
