// When to send emails. Pure.
import { daysBetween, type LocalDate } from "../time/zoned.ts";

/** Reminders go out in a window after the chosen local time, so an hourly cron that runs late still sends once. */
export const REMINDER_WINDOW_MINUTES = 120;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

export function reminderDue(u: {
  enabled: boolean;
  reminderTime: string; // HH:MM local
  localTime: string; // HH:MM now, local
  today: LocalDate;
  lastSentOn: LocalDate | null;
  lastActiveDate: LocalDate | null;
  hasActiveEnrollment: boolean;
}): boolean {
  if (!u.enabled || !u.hasActiveEnrollment) return false;
  if (u.lastSentOn === u.today) return false; // once a day
  if (u.lastActiveDate === u.today) return false; // already learned today: streak not at risk
  const diff = minutes(u.localTime) - minutes(u.reminderTime);
  return diff >= 0 && diff < REMINDER_WINDOW_MINUTES;
}

/** The streak a reminder can mention (0 if it already lapsed). */
export const streakAtRisk = (current: number, lastActiveDate: LocalDate | null, today: LocalDate) =>
  lastActiveDate && daysBetween(lastActiveDate, today) === 1 ? current : 0;
