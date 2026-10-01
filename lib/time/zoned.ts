// Calendar-date arithmetic in IANA time zones, with no dependencies.
// A "local date" is a YYYY-MM-DD string: the calendar day a user sees on their wall clock.
// Doing day maths on these strings (not on instants) makes it immune to DST: a day is a day,
// whether it lasted 23, 24 or 25 hours.

export type LocalDate = string; // "YYYY-MM-DD"

const dateFmt = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = dateFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dateFmt.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock fields of `instant` in `tz`. */
function wallClock(instant: Date, tz: string) {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, s: +p.second! };
}

/** The calendar date of `instant` in `tz`. */
export function localDate(instant: Date, tz: string): LocalDate {
  const { y, m, d } = wallClock(instant, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const toUtcDays = (date: LocalDate) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
};

/** Whole calendar days from `a` to `b` (negative if b is earlier). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return toUtcDays(b) - toUtcDays(a);
}

export function addDays(date: LocalDate, n: number): LocalDate {
  return new Date((toUtcDays(date) + n) * 86_400_000).toISOString().slice(0, 10);
}

/** A LocalDate as a Date at UTC midnight, the form Prisma uses for @db.Date columns. */
export const dateColumn = (date: LocalDate) => new Date(`${date}T00:00:00.000Z`);
/** Reads a @db.Date column back into a LocalDate. */
export const fromDateColumn = (d: Date): LocalDate => d.toISOString().slice(0, 10);

/** Offset of `tz` from UTC at `instant`, in minutes (e.g. +330 for Asia/Kolkata). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const w = wallClock(instant, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which the wall clock in `tz` reads `date` `hh:mm`.
 * A time skipped by a DST jump resolves to the instant just after the jump (e.g. 02:30 → 03:30);
 * a time that happens twice resolves to the first occurrence.
 */
export function zonedTimeToUtc(date: LocalDate, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, h!, mi!);
  // Try the offsets in effect a day either side; pick the earliest candidate that round-trips.
  const offsets = new Set([
    tzOffsetMinutes(new Date(wall - 86_400_000), tz),
    tzOffsetMinutes(new Date(wall), tz),
    tzOffsetMinutes(new Date(wall + 86_400_000), tz),
  ]);
  const candidates = [...offsets]
    .map((o) => new Date(wall - o * 60_000))
    .filter((c) => {
      const w = wallClock(c, tz);
      return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) === wall;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (candidates[0]) return candidates[0];
  // Skipped time (spring forward): use the pre-jump offset, which lands after the gap.
  const before = tzOffsetMinutes(new Date(wall - 86_400_000), tz);
  return new Date(wall - before * 60_000);
}

/** The next instant (strictly after `now`) at which the wall clock in `tz` reads hh:mm. */
export function nextDailyTime(now: Date, hhmm: string, tz: string): Date {
  const today = localDate(now, tz);
  const t = zonedTimeToUtc(today, hhmm, tz);
  return t.getTime() > now.getTime() ? t : zonedTimeToUtc(addDays(today, 1), hhmm, tz);
}

/** The hour (0–23) on the wall clock in `tz` at `instant`. */
export function localHour(instant: Date, tz: string): number {
  return wallClock(instant, tz).h;
}
